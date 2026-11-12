import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from '../http.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ filter: z.enum(['open', 'done']).default('open') }).strict();
const statusSchema = z.object({ status: z.enum(['open', 'done']) }).strict();

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new HttpError(400, 'Confira os dados e tente de novo.');
}

function trail(request: FastifyRequest) {
  return { ip: clientIp(request), userAgent: userAgent(request) };
}

interface BugReportRow {
  id: string;
  user_id: string;
  message: string;
  screen: string | null;
  app_version: string | null;
  platform: string | null;
  device: string | null;
  status: 'open' | 'done';
  reviewed_at: Date | null;
  created_at: Date;
  handle: string;
  name: string;
}

/**
 * Bugs avisados pelo app, no painel da equipe: lista os abertos (ou resolvidos) e marca como
 * resolvido. Usa a permissão de moderar posts e grava cada mudança na auditoria.
 */
export function registerBugReportModerationRoutes(app: FastifyInstance, deps: { pool: Pool }) {
  const { pool } = deps;

  app.get('/admin/v1/bug-reports', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const query = parse(listSchema, request.query ?? {});
    const result = await pool.query<BugReportRow>(
      `SELECT b.id, b.user_id, b.message, b.screen, b.app_version, b.platform, b.device,
              b.status, b.reviewed_at, b.created_at, u.handle, u.name
       FROM bug_reports b
       JOIN users u ON u.id = b.user_id
       WHERE b.status = $1
       ORDER BY b.created_at DESC
       LIMIT 200`,
      [query.filter],
    );
    const counts = await pool.query<{ open: number }>(
      `SELECT count(*)::int AS open FROM bug_reports WHERE status = 'open'`,
    );
    return {
      openCount: counts.rows[0]?.open ?? 0,
      reports: result.rows.map((row) => ({
        id: row.id,
        message: row.message,
        screen: row.screen,
        appVersion: row.app_version,
        platform: row.platform,
        device: row.device,
        status: row.status,
        reviewedAt: row.reviewed_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        userId: row.user_id,
        userHandle: row.handle,
        userName: row.name,
      })),
    };
  });

  app.post('/admin/v1/bug-reports/:id/status', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(statusSchema, request.body);
    const before = await pool.query<{ status: string }>(
      `SELECT status FROM bug_reports WHERE id = $1`,
      [id],
    );
    const current = before.rows[0];
    if (!current) throw new HttpError(404, 'Esse aviso não existe mais.');
    await pool.query(
      `UPDATE bug_reports SET status = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
      [id, body.status, session.user_id],
    );
    await writeAudit(pool, {
      actorId: session.user_id,
      action: `bug_report.${body.status}`,
      targetType: 'bug_report',
      targetId: id,
      before: { status: current.status },
      after: { status: body.status },
      ...trail(request),
    });
    return { id, status: body.status };
  });
}
