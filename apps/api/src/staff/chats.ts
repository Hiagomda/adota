import { chatFlagKinds } from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { HttpError } from '../http.js';
import { captureServerError } from '../monitoring.js';
import { notifyPeople } from '../notify.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });

const listSchema = z
  .object({
    filter: z.enum(['flagged', 'reported', 'reviewed', 'closed', 'recent']).default('flagged'),
    flag: z.enum(chatFlagKinds).optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

const reviewSchema = z
  .object({
    action: z.enum(['clear', 'close', 'reopen']),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

const hideSchema = z
  .object({
    messageId: z.string().uuid(),
    hidden: z.boolean(),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
  return result.data;
}

function likePattern(q: string | undefined): string | null {
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function trail(request: FastifyRequest) {
  return { ip: clientIp(request), userAgent: userAgent(request) };
}

interface ThreadSummaryRow {
  id: string;
  post_id: string;
  animal_name: string | null;
  species: string;
  post_status: string;
  author_id: string;
  author_name: string;
  author_handle: string;
  author_suspended: boolean;
  adopter_id: string;
  adopter_name: string;
  adopter_handle: string;
  adopter_suspended: boolean;
  review_status: 'clear' | 'flagged' | 'reviewed';
  flagged_at: Date | null;
  reviewed_at: Date | null;
  reviewer_handle: string | null;
  closed_at: Date | null;
  closed_reason: string | null;
  created_at: Date;
  last_at: Date | null;
  messages: number;
  withheld: number;
  flags: string[] | null;
  open_reports: number;
  preview: string | null;
  preview_flags: string[] | null;
}

const summarySelect = `
  SELECT t.id, t.post_id, an.name AS animal_name, an.species, p.status AS post_status,
         au.id AS author_id, au.name AS author_name, au.handle AS author_handle,
         au.suspended AS author_suspended,
         ad.id AS adopter_id, ad.name AS adopter_name, ad.handle AS adopter_handle,
         ad.suspended AS adopter_suspended,
         t.review_status, t.flagged_at, t.reviewed_at, rv.handle AS reviewer_handle,
         t.closed_at, t.closed_reason, t.created_at,
         COALESCE(t.last_message_at, t.created_at) AS last_at,
         (SELECT count(*)::int FROM adoption_messages m WHERE m.thread_id = t.id) AS messages,
         (SELECT count(*)::int FROM adoption_messages m
           WHERE m.thread_id = t.id AND m.withheld) AS withheld,
         (SELECT array_agg(DISTINCT f) FROM adoption_messages m, unnest(m.flags) AS f
           WHERE m.thread_id = t.id) AS flags,
         (SELECT count(*)::int FROM reports r
           WHERE r.target_type = 'adoption_thread' AND r.target_id = t.id
             AND r.status = 'open') AS open_reports,
         pv.body AS preview, pv.flags AS preview_flags
  FROM adoption_threads t
  JOIN posts p ON p.id = t.post_id
  JOIN animals an ON an.id = p.animal_id
  JOIN users au ON au.id = p.author_id
  JOIN users ad ON ad.id = t.adopter_id
  LEFT JOIN users rv ON rv.id = t.reviewed_by
  LEFT JOIN LATERAL (
    -- A prévia é a última mensagem sinalizada; sem sinal, a última mensagem.
    SELECT m.body, m.flags FROM adoption_messages m
    WHERE m.thread_id = t.id
    ORDER BY (cardinality(m.flags) > 0) DESC, m.created_at DESC
    LIMIT 1
  ) pv ON true`;

function summary(row: ThreadSummaryRow) {
  return {
    id: row.id,
    postId: row.post_id,
    animal: { name: row.animal_name, species: row.species, status: row.post_status },
    author: {
      id: row.author_id,
      name: row.author_name,
      handle: row.author_handle,
      suspended: row.author_suspended,
    },
    adopter: {
      id: row.adopter_id,
      name: row.adopter_name,
      handle: row.adopter_handle,
      suspended: row.adopter_suspended,
    },
    reviewStatus: row.review_status,
    flaggedAt: row.flagged_at?.toISOString() ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewerHandle: row.reviewer_handle,
    closedAt: row.closed_at?.toISOString() ?? null,
    closedReason: row.closed_reason,
    createdAt: row.created_at.toISOString(),
    lastAt: row.last_at?.toISOString() ?? null,
    messages: row.messages,
    withheld: row.withheld,
    flags: row.flags ?? [],
    openReports: row.open_reports,
    preview: row.preview,
    previewFlags: row.preview_flags ?? [],
  };
}

/**
 * Moderação das conversas de adoção pelo painel. A lista mostra só a prévia (a mensagem
 * sinalizada); abrir a conversa inteira fica gravado na auditoria, porque é conversa privada.
 */
export function registerChatModerationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.get('/admin/v1/chats', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'chats.moderate');
    const query = parse(listSchema, request.query ?? {});
    const where = {
      flagged: `t.review_status = 'flagged'`,
      reported: `EXISTS (SELECT 1 FROM reports r WHERE r.target_type = 'adoption_thread'
                   AND r.target_id = t.id AND r.status = 'open')`,
      reviewed: `t.review_status = 'reviewed'`,
      closed: `t.closed_at IS NOT NULL`,
      recent: `true`,
    }[query.filter];
    const order =
      query.filter === 'flagged'
        ? 't.flagged_at DESC'
        : 'COALESCE(t.last_message_at, t.created_at) DESC';
    const result = await pool.query<ThreadSummaryRow>(
      `${summarySelect}
       WHERE ${where}
         AND ($1::text IS NULL OR EXISTS (
           SELECT 1 FROM adoption_messages m WHERE m.thread_id = t.id AND $1 = ANY(m.flags)
         ))
         AND ($2::text IS NULL OR au.handle ILIKE $2 OR ad.handle ILIKE $2
              OR au.name ILIKE $2 OR ad.name ILIKE $2 OR an.name ILIKE $2)
       ORDER BY ${order}
       LIMIT 100`,
      [query.flag ?? null, likePattern(query.q)],
    );
    return { chats: result.rows.map(summary) };
  });

  app.get('/admin/v1/chats/:id', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'chats.moderate');
    const id = parse(idSchema, request.params).id;
    const found = await pool.query<ThreadSummaryRow>(`${summarySelect} WHERE t.id = $1`, [id]);
    const row = found.rows[0];
    if (!row) throw new HttpError(404, 'Essa conversa não existe mais.');
    const messages = await pool.query<{
      id: string;
      sender_id: string;
      body: string;
      flags: string[];
      withheld: boolean;
      hidden_at: Date | null;
      hidden_by_handle: string | null;
      created_at: Date;
    }>(
      `SELECT m.id, m.sender_id, m.body, m.flags, m.withheld, m.hidden_at,
              hb.handle AS hidden_by_handle, m.created_at
       FROM adoption_messages m
       LEFT JOIN users hb ON hb.id = m.hidden_by
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC
       LIMIT 500`,
      [id],
    );
    const reports = await pool.query<{
      id: string;
      reason: string;
      status: string;
      created_at: Date;
      reporter_handle: string | null;
    }>(
      `SELECT r.id, r.reason, r.status, r.created_at, u.handle AS reporter_handle
       FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.target_type = 'adoption_thread' AND r.target_id = $1
       ORDER BY r.created_at DESC`,
      [id],
    );
    await writeAudit(pool, {
      actorId: session.user_id,
      action: 'chat.read',
      targetType: 'adoption_thread',
      targetId: id,
      ...trail(request),
    });
    return {
      chat: summary(row),
      messages: messages.rows.map((message) => ({
        id: message.id,
        from: message.sender_id === row.author_id ? 'author' : 'adopter',
        body: message.body,
        flags: message.flags,
        withheld: message.withheld,
        hiddenAt: message.hidden_at?.toISOString() ?? null,
        hiddenByHandle: message.hidden_by_handle,
        createdAt: message.created_at.toISOString(),
      })),
      reports: reports.rows.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.created_at.toISOString(),
        reporterHandle: report.reporter_handle,
      })),
    };
  });

  app.post('/admin/v1/chats/:id/review', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'chats.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(reviewSchema, request.body);
    const client = await pool.connect();
    let participants: string[] = [];
    try {
      await client.query('BEGIN');
      const current = await client.query<{
        review_status: string;
        closed_at: Date | null;
        adopter_id: string;
        author_id: string;
      }>(
        `SELECT t.review_status, t.closed_at, t.adopter_id, p.author_id
         FROM adoption_threads t JOIN posts p ON p.id = t.post_id
         WHERE t.id = $1 FOR UPDATE OF t`,
        [id],
      );
      const before = current.rows[0];
      if (!before) throw new HttpError(404, 'Essa conversa não existe mais.');
      if (body.action === 'clear') {
        await client.query(
          `UPDATE adoption_threads
           SET review_status = 'reviewed', reviewed_at = now(), reviewed_by = $2
           WHERE id = $1`,
          [id, session.user_id],
        );
      }
      if (body.action === 'close') {
        if (before.closed_at) throw new HttpError(409, 'Essa conversa já está encerrada.');
        await client.query(
          `UPDATE adoption_threads
           SET closed_at = now(), closed_reason = $3,
               review_status = 'reviewed', reviewed_at = now(), reviewed_by = $2
           WHERE id = $1`,
          [id, session.user_id, body.justification],
        );
        participants = [before.adopter_id, before.author_id];
      }
      if (body.action === 'reopen') {
        if (!before.closed_at) throw new HttpError(409, 'Essa conversa não está encerrada.');
        await client.query(
          `UPDATE adoption_threads SET closed_at = NULL, closed_reason = NULL WHERE id = $1`,
          [id],
        );
      }
      // Denúncias abertas desta conversa se resolvem junto com a decisão.
      if (body.action !== 'reopen') {
        await client.query(
          `UPDATE reports SET status = $2
           WHERE target_type = 'adoption_thread' AND target_id = $1 AND status = 'open'`,
          [id, body.action === 'close' ? 'hidden' : 'dismissed'],
        );
      }
      await writeAudit(client, {
        actorId: session.user_id,
        action: `chat.${body.action}`,
        targetType: 'adoption_thread',
        targetId: id,
        before: { reviewStatus: before.review_status, closed: before.closed_at !== null },
        after: { justification: body.justification },
        ...trail(request),
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (participants.length > 0) {
      await notifyPeople(pool, env, participants, 'adoption_chat_closed', {
        title: 'Conversa encerrada pela equipe',
        body: 'A equipe encerrou uma conversa de adoção por segurança. Se precisar, fale com o Suporte.',
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:chat-closed' }, 'best-effort step failed');
        captureServerError(error, { where: 'notify:chat-closed' });
      });
    }
    return { ok: true };
  });

  app.post('/admin/v1/chats/:id/hide', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'chats.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(hideSchema, request.body);
    const updated = await pool.query(
      `UPDATE adoption_messages
       SET hidden_at = CASE WHEN $3 THEN now() ELSE NULL END,
           hidden_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END
       WHERE id = $2 AND thread_id = $1`,
      [id, body.messageId, body.hidden, session.user_id],
    );
    if ((updated.rowCount ?? 0) === 0) throw new HttpError(404, 'Essa mensagem não existe mais.');
    await writeAudit(pool, {
      actorId: session.user_id,
      action: body.hidden ? 'chat.hide_message' : 'chat.show_message',
      targetType: 'adoption_thread',
      targetId: id,
      after: { messageId: body.messageId, justification: body.justification },
      ...trail(request),
    });
    return { hidden: body.hidden };
  });
}
