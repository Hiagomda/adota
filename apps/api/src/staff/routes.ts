import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { HttpError } from '../http.js';
import type { createQueue } from '../notify.js';
import { rowsOf } from '../session.js';
import { registerEventModerationRoutes } from './events.js';
import { registerModerationRoutes } from './moderation.js';
import { registerStalledCaseRoutes } from './stalled.js';
import { registerChatModerationRoutes } from './chats.js';
import { registerFeedPointModerationRoutes } from './feedPoints.js';
import { registerBugReportModerationRoutes } from './bugReports.js';
import { registerPartnerModerationRoutes } from './partners.js';
import { registerStaffCreateRoutes } from './create.js';
import { decoyHash, verifyPassword } from './password.js';
import {
  assignableRoles,
  assertPermission,
  decideRoleChange,
  isStaffRole,
  permissionsFor,
  requirePresentedCredential,
  type Permission,
} from './policy.js';
type RescueQueue = ReturnType<typeof createQueue>;

const SESSION_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
/**
 * Bloqueio do usuário vindo de qualquer lugar. Bem acima dos 5 por endereço: quem erra a senha
 * tranca só o próprio IP, e um ataque espalhado por muitos IPs ainda para.
 */
const MAX_FAILURES_ANY_IP = 25;

const roleChangeSchema = z
  .object({
    role: z.enum(assignableRoles),
    expectedRole: z.enum(assignableRoles),
    justification: z.string().trim().min(10).max(500),
    password: z.string().min(1).max(200),
  })
  .strict();

const revokeSchema = z.object({ password: z.string().min(1).max(200) }).strict();

const loginSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(3).max(32),
    password: z.string().min(1).max(200),
  })
  .strict();

interface StaffRow {
  id: string;
  name: string;
  handle: string;
  role: string;
  verified: boolean;
  suspended: boolean;
}

interface SessionRow {
  id: string;
  user_id: string;
  csrf_hash: string;
  expires_at: Date;
  idle_expires_at: Date;
  last_totp_at: Date;
  role: string;
  name: string;
  handle: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHex(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Segredo que o painel (AdotaSite) manda junto com o IP de quem está nele. Vazio: desligado. */
let staffProxySecret: Buffer | null = null;

export function configureStaffProxy(secret: string | undefined): void {
  staffProxySecret = secret ? Buffer.from(secret) : null;
}

export const STAFF_PROXY_SECRET_HEADER = 'x-egua-proxy-secret';
export const STAFF_CLIENT_IP_HEADER = 'x-egua-client-ip';

/**
 * IP de quem fez o pedido. O painel chama a API pelo servidor dele, então sem ajuda todo login da
 * equipe chega com o IP da VPS: o limite por IP e o bloqueio por senha errada valiam para todo
 * mundo junto. Quando o painel manda o segredo certo, vale o IP que ele repassa. Sem o segredo
 * (ou com um errado), o cabeçalho é ignorado, então ninguém escolhe o próprio IP de fora.
 */
export function clientIp(request: FastifyRequest): string {
  if (staffProxySecret) {
    const sent = request.headers[STAFF_PROXY_SECRET_HEADER];
    const forwarded = request.headers[STAFF_CLIENT_IP_HEADER];
    const sentBytes = typeof sent === 'string' ? Buffer.from(sent) : null;
    if (
      sentBytes !== null &&
      typeof forwarded === 'string' &&
      isIP(forwarded.trim()) !== 0 &&
      sentBytes.length === staffProxySecret.length &&
      timingSafeEqual(sentBytes, staffProxySecret)
    ) {
      return forwarded.trim();
    }
  }
  return request.ip || 'unknown';
}

export function userAgent(request: FastifyRequest): string {
  const raw = request.headers['user-agent'];
  return typeof raw === 'string' ? raw.slice(0, 200) : '';
}

function allowlisted(env: Env, ip: string): void {
  const list =
    env.ADMIN_IP_ALLOWLIST?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  if (list.length === 0) return;
  if (!list.includes(ip)) throw new HttpError(403, 'Este endereço não pode abrir o painel.');
}

async function assertUnlocked(pool: Pool, subject: string): Promise<void> {
  const result = await pool.query<{ locked_until: Date | null }>(
    `SELECT locked_until FROM staff_login_attempts WHERE subject = $1`,
    [subject],
  );
  const until = result.rows[0]?.locked_until;
  if (until && until.getTime() > Date.now()) {
    throw new HttpError(429, 'Muitas tentativas. Espere 15 minutos.');
  }
}

async function recordFailure(
  pool: Pool,
  subject: string,
  maxFailures = MAX_FAILURES,
): Promise<void> {
  await pool.query(
    `INSERT INTO staff_login_attempts (subject, failures, locked_until, updated_at)
     VALUES ($1, 1, NULL, now())
     ON CONFLICT (subject) DO UPDATE SET
       failures = staff_login_attempts.failures + 1,
       locked_until = CASE
         WHEN staff_login_attempts.failures + 1 >= $2 THEN now() + ($3::text || ' milliseconds')::interval
         ELSE staff_login_attempts.locked_until
       END,
       updated_at = now()`,
    [subject, maxFailures, String(LOCK_MS)],
  );
}

async function clearFailures(pool: Pool, subject: string): Promise<void> {
  await pool.query(`DELETE FROM staff_login_attempts WHERE subject = $1`, [subject]);
}

export async function writeAudit(
  db: Pool | PoolClient,
  event: {
    actorId: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
    ip: string;
    userAgent: string;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events (actor_id, action, target_type, target_id, before, after, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      event.actorId,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
      event.ip,
      event.userAgent,
    ],
  );
}

function cookieHeader(env: Env, token: string, csrf: string): string[] {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_MS / 1000);
  return [
    `egua_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    `egua_admin_csrf=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ];
}

function clearCookieHeader(env: Env): string[] {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `egua_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    `egua_admin_csrf=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  ];
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function presented(request: FastifyRequest): { token: string; via: 'bearer' | 'cookie' } | null {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer adm.')) {
    return { token: authorization.slice('Bearer '.length), via: 'bearer' };
  }
  const cookie = readCookie(request.headers.cookie, 'egua_admin');
  if (cookie?.startsWith('adm.')) return { token: cookie, via: 'cookie' };
  return null;
}

async function openSession(
  pool: Pool,
  env: Env,
  reply: FastifyReply,
  userId: string,
  request: FastifyRequest,
): Promise<{ token: string; csrf: string }> {
  const token = `adm.${randomBytes(32).toString('base64url')}`;
  const csrf = randomBytes(32).toString('base64url');
  const now = Date.now();
  await pool.query(
    `INSERT INTO admin_sessions (
       user_id, token_hash, csrf_hash, expires_at, idle_expires_at, last_seen_at, last_totp_at, ip, user_agent
     ) VALUES ($1, $2, $3, $4, $5, now(), now(), $6, $7)`,
    [
      userId,
      sha256(token),
      sha256(csrf),
      new Date(now + SESSION_MS),
      new Date(now + IDLE_MS),
      clientIp(request),
      userAgent(request),
    ],
  );
  reply.header('set-cookie', cookieHeader(env, token, csrf));
  await writeAudit(pool, {
    actorId: userId,
    action: 'staff.session_open',
    ip: clientIp(request),
    userAgent: userAgent(request),
  });
  return { token, csrf };
}

export async function loadSession(
  pool: Pool,
  request: FastifyRequest,
): Promise<SessionRow & { via: 'bearer' | 'cookie'; token: string }> {
  const credential = presented(request);
  requirePresentedCredential(credential?.token);
  if (!credential) throw new HttpError(401, 'Entre de novo no painel.');
  const result = await pool.query<SessionRow>(
    `SELECT s.id, s.user_id, s.csrf_hash, s.expires_at, s.idle_expires_at, s.last_totp_at,
            u.role, u.name, u.handle
     FROM admin_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND u.deleted_at IS NULL AND u.suspended = false`,
    [sha256(credential.token)],
  );
  const row = result.rows[0];
  if (!row || !isStaffRole(row.role)) throw new HttpError(401, 'Entre de novo no painel.');
  const now = Date.now();
  if (row.expires_at.getTime() <= now || row.idle_expires_at.getTime() <= now) {
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [row.id],
    );
    throw new HttpError(401, 'Sua sessão do painel expirou. Entre de novo.');
  }
  if (credential.via === 'cookie') {
    const header = request.headers['x-csrf-token'];
    const csrf = typeof header === 'string' ? header : '';
    if (!csrf || !sameHex(sha256(csrf), row.csrf_hash)) {
      throw new HttpError(403, 'Não consegui confirmar esta ação.');
    }
  }
  const idle = new Date(Math.min(now + IDLE_MS, row.expires_at.getTime()));
  await pool.query(
    `UPDATE admin_sessions SET last_seen_at = now(), idle_expires_at = $2 WHERE id = $1`,
    [row.id, idle],
  );
  return { ...row, via: credential.via, token: credential.token };
}

function parseBody<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
  return result.data;
}

/** Confere a senha de quem já está no painel, para ações sensíveis. */
async function passwordMatches(pool: Pool, userId: string, password: string): Promise<boolean> {
  const result = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM staff_passwords WHERE user_id = $1`,
    [userId],
  );
  const stored = result.rows[0]?.password_hash;
  return verifyPassword(password, stored ?? (await decoyHash()));
}

/**
 * Limite de tentativas de login do painel por IP **e** usuário. Contava só por IP: como o painel
 * chama a API pelo servidor dele, sem o STAFF_PROXY_SECRET todo mundo tem o IP da VPS, e 8
 * tentativas de qualquer pessoa com qualquer nome travavam o login da equipe inteira. Roda depois
 * de ler o corpo (preHandler) para saber o usuário. Força bruta espalhada por muitos nomes ainda
 * esbarra no bloqueio por usuário (assertUnlocked) e no limite global de 600/min por IP.
 */
export function staffLoginRateKey(request: FastifyRequest): string {
  const body = request.body as { username?: unknown } | undefined;
  const username =
    typeof body?.username === 'string' ? body.username.trim().toLowerCase().slice(0, 32) : '';
  return `staff-login:${clientIp(request)}:${username}`;
}

const loginLimit = {
  config: {
    rateLimit: {
      max: 8,
      timeWindow: '15 minutes',
      hook: 'preHandler' as const,
      keyGenerator: staffLoginRateKey,
    },
  },
};

export async function registerStaffRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; queue: RescueQueue },
): Promise<void> {
  const { env, pool, queue } = deps;
  configureStaffProxy(env.STAFF_PROXY_SECRET);

  app.post('/admin/v1/login', loginLimit, async (request, reply) => {
    const ip = clientIp(request);
    allowlisted(env, ip);
    const body = parseBody(loginSchema, request.body);
    // Dois bloqueios: usuário + IP (5 erros) e usuário de qualquer IP (25 erros). Sem o segredo do
    // painel o IP é o da VPS para todos, e fica como antes (5 erros trancam o usuário).
    const perIp = `login:${body.username}:${ip}`;
    const anyIp = `login:${body.username}`;
    await assertUnlocked(pool, perIp);
    await assertUnlocked(pool, anyIp);
    const found = await pool.query<{ user_id: string; password_hash: string; role: string }>(
      `SELECT p.user_id, p.password_hash, u.role
       FROM staff_passwords p JOIN users u ON u.id = p.user_id
       WHERE p.username = $1 AND u.deleted_at IS NULL AND u.suspended = false`,
      [body.username],
    );
    const row = found.rows[0];
    // Sem conta, compara com um hash qualquer: a resposta demora o mesmo tanto.
    const ok = await verifyPassword(body.password, row?.password_hash ?? (await decoyHash()));
    if (!row || !ok || !isStaffRole(row.role)) {
      await recordFailure(pool, perIp);
      await recordFailure(pool, anyIp, MAX_FAILURES_ANY_IP);
      throw new HttpError(401, 'Usuário ou senha incorretos.');
    }
    await clearFailures(pool, perIp);
    await clearFailures(pool, anyIp);
    const session = await openSession(pool, env, reply, row.user_id, request);
    return { token: session.token, csrf: session.csrf };
  });

  app.post('/admin/v1/session/logout', async (request, reply) => {
    const session = await loadSession(pool, request);
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [session.id],
    );
    reply.header('set-cookie', clearCookieHeader(env));
    await writeAudit(pool, {
      actorId: session.user_id,
      action: 'staff.session_close',
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
    return { ok: true };
  });

  app.post('/admin/v1/sessions/revoke', async (request, reply) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'session.revoke_own');
    const body = parseBody(revokeSchema, request.body);
    if (!(await passwordMatches(pool, session.user_id, body.password))) {
      throw new HttpError(403, 'Senha incorreta.');
    }
    await pool.query(
      `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [session.user_id],
    );
    reply.header('set-cookie', clearCookieHeader(env));
    await writeAudit(pool, {
      actorId: session.user_id,
      action: 'staff.sessions_revoke',
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
    return { ok: true };
  });

  app.get('/admin/v1/me', async (request) => {
    const session = await loadSession(pool, request);
    return {
      id: session.user_id,
      name: session.name,
      handle: session.handle,
      role: session.role,
      permissions: permissionsFor(session.role),
    };
  });

  app.get('/admin/v1/team', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'team.read');
    const result = await pool.query<StaffRow>(
      `SELECT id, name, handle, role, verified, suspended
       FROM users
       WHERE deleted_at IS NULL
         AND role IN ('moderator', 'support', 'ong_reviewer', 'finance_reviewer', 'admin', 'superadmin')
       ORDER BY name ASC
       LIMIT 100`,
    );
    return { team: result.rows };
  });

  app.post('/admin/v1/team/:id/role', async (request) => {
    const session = await loadSession(pool, request);
    const targetId = parseBody(z.object({ id: z.string().uuid() }), request.params).id;
    const body = parseBody(roleChangeSchema, request.body);
    const passwordOk = await passwordMatches(pool, session.user_id, body.password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [targetId],
      );
      const currentRole = current.rows[0]?.role;
      if (!currentRole) throw new HttpError(404, 'Essa conta não existe.');
      const count = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM users
         WHERE role = 'superadmin' AND deleted_at IS NULL AND suspended = false`,
      );
      const decision = decideRoleChange({
        actorRole: session.role,
        actorId: session.user_id,
        targetId,
        currentRole,
        nextRole: body.role,
        expectedRole: body.expectedRole,
        activeSuperadmins: count.rows[0]?.total ?? 0,
        recentAuth: passwordOk,
        justification: body.justification,
      });
      if (decision.changed) {
        const updated = await client.query(
          `UPDATE users SET role = $2 WHERE id = $1 AND role = $3`,
          [targetId, body.role, body.expectedRole],
        );
        if ((updated.rowCount ?? 0) !== 1) {
          throw new HttpError(
            409,
            'Outra pessoa alterou esse papel. Atualize a lista e tente de novo.',
          );
        }
        await client.query(
          `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [targetId],
        );
        await writeAudit(client, {
          actorId: session.user_id,
          action: 'staff.role_change',
          targetType: 'user',
          targetId,
          before: { role: currentRole },
          after: { role: body.role, justification: body.justification.trim() },
          ip: clientIp(request),
          userAgent: userAgent(request),
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return { role: body.role };
  });

  app.get('/admin/v1/audit', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'audit.read');
    const query = parseBody(
      z.object({ cursor: z.string().uuid().optional() }).strict(),
      request.query ?? {},
    );
    const result = await pool.query<{
      id: string;
      actor_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      before: unknown;
      after: unknown;
      created_at: Date;
    }>(
      `SELECT id, actor_id, action, target_type, target_id, before, after, created_at
       FROM audit_events
       WHERE $1::uuid IS NULL
          OR (created_at, id) < (SELECT created_at, id FROM audit_events WHERE id = $1)
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [query.cursor ?? null],
    );
    const events = rowsOf<(typeof result.rows)[number]>(result);
    return {
      events: events.map((event) => ({
        id: event.id,
        actorId: event.actor_id,
        action: event.action,
        targetType: event.target_type,
        targetId: event.target_id,
        before: event.before,
        after: event.after,
        createdAt: event.created_at.toISOString(),
      })),
      nextCursor: events.length === 50 ? (events[events.length - 1]?.id ?? null) : null,
    };
  });

  registerModerationRoutes(app, { env, pool, queue });
  registerEventModerationRoutes(app, { env, pool });
  registerPartnerModerationRoutes(app, { env, pool });
  registerFeedPointModerationRoutes(app, { env, pool });
  registerBugReportModerationRoutes(app, { pool });
  registerStalledCaseRoutes(app, { env, pool });
  registerChatModerationRoutes(app, { env, pool });
  registerStaffCreateRoutes(app, { env, pool });
}

export type StaffPermissionName = Permission;
