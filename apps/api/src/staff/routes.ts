import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { findUserByFirebaseUid, grantOwnerRole, isOwnerToken } from '../accounts.js';
import type { Env } from '../config.js';
import { ensureFirebaseApp, firebaseChecksRevocation } from '../firebaseAdmin.js';
import { HttpError } from '../http.js';
import type { createQueue } from '../notify.js';
import { rowsOf } from '../session.js';
import { registerModerationRoutes } from './moderation.js';
import {
  assignableRoles,
  assertPermission,
  decideRoleChange,
  isStaffRole,
  permissionsFor,
  requirePresentedCredential,
  type Permission,
} from './policy.js';
import {
  base32Encode,
  decryptSecret,
  encryptSecret,
  otpauthUrl,
  readStaffTicket,
  signStaffTicket,
  totpKeyFrom,
  totpMatches,
} from './totp.js';

type RescueQueue = ReturnType<typeof createQueue>;

const SESSION_MS = 8 * 60 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const TICKET_MS = 5 * 60 * 1000;
const RECENT_TOTP_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const sessionStartSchema = z
  .object({
    firebaseToken: z.string().min(8).max(8192).optional(),
    devToken: z.string().min(4).max(200).optional(),
  })
  .strict();

const codeSchema = z
  .object({
    ticket: z.string().min(10).max(2000),
    code: z.string().trim().min(6).max(32),
  })
  .strict();

const roleChangeSchema = z
  .object({
    role: z.enum(assignableRoles),
    expectedRole: z.enum(assignableRoles),
    justification: z.string().trim().min(10).max(500),
    totpCode: z.string().trim().min(6).max(12),
  })
  .strict();

const revokeSchema = z.object({ totpCode: z.string().trim().min(6).max(32) }).strict();

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

export function clientIp(request: FastifyRequest): string {
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

async function recordFailure(pool: Pool, subject: string): Promise<void> {
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
    [subject, MAX_FAILURES, String(LOCK_MS)],
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

async function identityFromBody(env: Env, pool: Pool, body: z.infer<typeof sessionStartSchema>) {
  if (body.devToken) {
    if (!env.authDevMode || !body.devToken.startsWith('dev:')) {
      throw new HttpError(401, 'Não reconheci essa conta.');
    }
    return findUserByFirebaseUid(pool, body.devToken);
  }
  if (!body.firebaseToken) throw new HttpError(401, 'Não reconheci essa conta.');
  if (!env.FIREBASE_PROJECT_ID) throw new HttpError(401, 'Não reconheci essa conta.');
  await ensureFirebaseApp(env);
  const admin = await import('firebase-admin');
  const decoded = await admin
    .auth()
    .verifyIdToken(body.firebaseToken, firebaseChecksRevocation(env));
  if (isOwnerToken(env, decoded)) await grantOwnerRole(pool, decoded.uid);
  return findUserByFirebaseUid(pool, decoded.uid);
}

function recoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

async function secretFor(
  pool: Pool,
  key: Buffer,
  userId: string,
  enabledOnly: boolean,
): Promise<Buffer> {
  const result = await pool.query<{ secret_enc: string; enabled_at: Date | null }>(
    `SELECT secret_enc, enabled_at FROM staff_totp WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row || (enabledOnly && !row.enabled_at)) {
    throw new HttpError(401, 'Ative a verificação em duas etapas antes de entrar.');
  }
  return decryptSecret(key, row.secret_enc);
}

async function consumeRecoveryCode(pool: Pool, userId: string, code: string): Promise<boolean> {
  const normalized = code.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z2-9]{10}$/.test(normalized)) return false;
  const result = await pool.query<{ id: string; code_hash: string }>(
    `SELECT id, code_hash FROM staff_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
  const match = result.rows.find((row) => sameHex(row.code_hash, sha256(normalized)));
  if (!match) return false;
  const updated = await pool.query(
    `UPDATE staff_recovery_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
    [match.id],
  );
  return (updated.rowCount ?? 0) === 1;
}

function parseBody<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
  return result.data;
}

const loginLimit = { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } };

export async function registerStaffRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; queue: RescueQueue },
): Promise<void> {
  const { env, pool, queue } = deps;

  app.post('/admin/v1/session', loginLimit, async (request) => {
    const ip = clientIp(request);
    allowlisted(env, ip);
    await assertUnlocked(pool, `ip:${ip}`);
    const body = parseBody(sessionStartSchema, request.body);
    let user: Awaited<ReturnType<typeof identityFromBody>>;
    try {
      user = await identityFromBody(env, pool, body);
    } catch (error) {
      await recordFailure(pool, `ip:${ip}`);
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, 'Não reconheci essa conta.');
    }
    if (!user || !isStaffRole(user.role)) {
      await recordFailure(pool, `ip:${ip}`);
      throw new HttpError(
        user ? 403 : 401,
        user ? 'Essa conta não faz parte da equipe.' : 'Não reconheci essa conta.',
      );
    }
    await clearFailures(pool, `ip:${ip}`);
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const totp = await pool.query<{ enabled_at: Date | null }>(
      `SELECT enabled_at FROM staff_totp WHERE user_id = $1`,
      [user.id],
    );
    const purpose = totp.rows[0]?.enabled_at ? 'totp' : 'enroll';
    const ticket = signStaffTicket(key, { sub: user.id, purpose, exp: Date.now() + TICKET_MS });
    return { step: purpose, ticket };
  });

  app.post('/admin/v1/totp/enroll', loginLimit, async (request) => {
    const body = parseBody(
      z.object({ ticket: z.string().min(10).max(2000) }).strict(),
      request.body,
    );
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const ticket = readStaffTicket(key, body.ticket, 'enroll');
    const account = await pool.query<{ handle: string; role: string }>(
      `SELECT handle, role FROM users WHERE id = $1 AND deleted_at IS NULL AND suspended = false`,
      [ticket.sub],
    );
    const row = account.rows[0];
    if (!row || !isStaffRole(row.role))
      throw new HttpError(403, 'Essa conta não faz parte da equipe.');
    const enabled = await pool.query<{ enabled_at: Date | null }>(
      `SELECT enabled_at FROM staff_totp WHERE user_id = $1`,
      [ticket.sub],
    );
    if (enabled.rows[0]?.enabled_at)
      throw new HttpError(409, 'A verificação em duas etapas já está ativa.');
    const secret = randomBytes(20);
    await pool.query(
      `INSERT INTO staff_totp (user_id, secret_enc, enabled_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled_at = NULL, created_at = now()`,
      [ticket.sub, encryptSecret(key, secret)],
    );
    return { otpauthUrl: otpauthUrl(row.handle, secret), secret: base32Encode(secret) };
  });

  app.post('/admin/v1/totp/confirm', loginLimit, async (request, reply) => {
    const body = parseBody(codeSchema, request.body);
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const ticket = readStaffTicket(key, body.ticket, 'enroll');
    await assertUnlocked(pool, `user:${ticket.sub}`);
    const secret = await secretFor(pool, key, ticket.sub, false);
    if (!totpMatches(secret, body.code)) {
      await recordFailure(pool, `user:${ticket.sub}`);
      throw new HttpError(401, 'Código inválido.');
    }
    const codes = Array.from({ length: 8 }, () => recoveryCode());
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const enabled = await client.query(
        `UPDATE staff_totp SET enabled_at = now() WHERE user_id = $1 AND enabled_at IS NULL`,
        [ticket.sub],
      );
      if ((enabled.rowCount ?? 0) !== 1)
        throw new HttpError(409, 'A verificação em duas etapas já está ativa.');
      await client.query(`DELETE FROM staff_recovery_codes WHERE user_id = $1`, [ticket.sub]);
      for (const code of codes) {
        await client.query(
          `INSERT INTO staff_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
          [ticket.sub, sha256(code)],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await clearFailures(pool, `user:${ticket.sub}`);
    const session = await openSession(pool, env, reply, ticket.sub, request);
    return { token: session.token, csrf: session.csrf, recoveryCodes: codes };
  });

  app.post('/admin/v1/session/totp', loginLimit, async (request, reply) => {
    const body = parseBody(codeSchema, request.body);
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const ticket = readStaffTicket(key, body.ticket, 'totp');
    await assertUnlocked(pool, `user:${ticket.sub}`);
    const secret = await secretFor(pool, key, ticket.sub, true);
    const codeOk =
      totpMatches(secret, body.code) || (await consumeRecoveryCode(pool, ticket.sub, body.code));
    if (!codeOk) {
      await recordFailure(pool, `user:${ticket.sub}`);
      throw new HttpError(401, 'Código inválido.');
    }
    await clearFailures(pool, `user:${ticket.sub}`);
    const session = await openSession(pool, env, reply, ticket.sub, request);
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
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const secret = await secretFor(pool, key, session.user_id, true);
    if (!totpMatches(secret, body.totpCode))
      throw new HttpError(401, 'Confirme com o código do autenticador.');
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
    const key = totpKeyFrom(env.ADMIN_TOTP_KEY);
    const recent = session.last_totp_at.getTime() + RECENT_TOTP_MS > Date.now();
    const codeOk = totpMatches(await secretFor(pool, key, session.user_id, true), body.totpCode);
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
        recentTotp: recent || codeOk,
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
    if (codeOk) {
      await pool.query(`UPDATE admin_sessions SET last_totp_at = now() WHERE id = $1`, [
        session.id,
      ]);
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
}

export type StaffPermissionName = Permission;
