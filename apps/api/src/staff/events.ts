import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { categoryLabel, inTransaction, recordChange } from '../events.js';
import { HttpError } from '../http.js';
import { notifyPeople } from '../notify.js';
import { rowsOf } from '../session.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });

const listSchema = z
  .object({
    filter: z.enum(['pending', 'reported', 'upcoming', 'past', 'hidden']).default('pending'),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

const reviewSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.action === 'approve' || (value.note?.length ?? 0) >= 5, {
    message: 'Escreva o motivo da recusa para quem organizou.',
  });

const visibilitySchema = z
  .object({
    hidden: z.boolean(),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

const reportsSchema = z.object({ action: z.literal('dismiss') }).strict();

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function likePattern(q: string | undefined): string | null {
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function trail(request: FastifyRequest) {
  return { ip: clientIp(request), userAgent: userAgent(request) };
}

const filters: Record<z.infer<typeof listSchema>['filter'], string> = {
  pending: `e.review_status = 'pending' AND e.hidden = false`,
  reported: `EXISTS (SELECT 1 FROM event_reports r WHERE r.event_id = e.id AND r.status = 'open')`,
  upcoming: `e.review_status = 'published' AND e.hidden = false AND e.ends_at > now()`,
  past: `e.ends_at <= now()`,
  hidden: `e.hidden = true`,
};

/**
 * Moderação da agenda no painel da equipe: aprovar ou recusar evento de quem não tem selo,
 * esconder evento denunciado e ver o resultado dos que já aconteceram. Usa a mesma permissão
 * de moderar posts e grava cada decisão na auditoria e no histórico do evento.
 */
export function registerEventModerationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.get('/admin/v1/events', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const query = parse(listSchema, request.query ?? {});
    const order = query.filter === 'past' ? 'e.starts_at DESC' : 'e.starts_at ASC';
    const result = await pool.query<{
      id: string;
      title: string;
      description: string | null;
      category: keyof typeof categoryLabel;
      place_label: string;
      neighborhood: string | null;
      starts_at: Date;
      ends_at: Date;
      capacity: number | null;
      review_status: string;
      review_note: string | null;
      hidden: boolean;
      cancelled_at: Date | null;
      created_at: Date;
      result_summary: string | null;
      result_adoptions: number | null;
      registered: number;
      attended: number;
      open_reports: number;
      last_report: string | null;
      organizer_id: string;
      organizer_handle: string;
      organizer_name: string;
      organizer_verified: boolean;
    }>(
      `SELECT e.id, e.title, e.description, e.category, e.place_label, e.neighborhood,
              e.starts_at, e.ends_at, e.capacity, e.review_status, e.review_note, e.hidden,
              e.cancelled_at, e.created_at, e.result_summary, e.result_adoptions,
              (SELECT count(*) FROM event_registrations r
                WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered,
              (SELECT count(*) FROM event_registrations r
                WHERE r.event_id = e.id AND r.checked_in_at IS NOT NULL)::int AS attended,
              (SELECT count(*) FROM event_reports r
                WHERE r.event_id = e.id AND r.status = 'open')::int AS open_reports,
              (SELECT r.reason FROM event_reports r WHERE r.event_id = e.id AND r.status = 'open'
                ORDER BY r.created_at DESC LIMIT 1) AS last_report,
              u.id AS organizer_id, u.handle AS organizer_handle, u.name AS organizer_name,
              u.verified AS organizer_verified
       FROM adoption_events e
       JOIN users u ON u.id = e.user_id
       WHERE ${filters[query.filter]}
         AND ($1::text IS NULL OR e.title ILIKE $1 OR u.handle ILIKE $1 OR e.place_label ILIKE $1)
       ORDER BY ${order}
       LIMIT 80`,
      [likePattern(query.q)],
    );
    return {
      events: rowsOf<(typeof result.rows)[number]>(result).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        categoryLabel: categoryLabel[row.category] ?? row.category,
        placeLabel: row.place_label,
        neighborhood: row.neighborhood,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        capacity: row.capacity,
        registered: row.registered,
        attended: row.attended,
        reviewStatus: row.review_status,
        reviewNote: row.review_note,
        hidden: row.hidden,
        cancelled: row.cancelled_at !== null,
        createdAt: row.created_at.toISOString(),
        result: row.result_summary
          ? { summary: row.result_summary, adoptions: row.result_adoptions }
          : null,
        openReports: row.open_reports,
        lastReport: row.last_report,
        organizerId: row.organizer_id,
        organizerHandle: row.organizer_handle,
        organizerName: row.organizer_name,
        organizerVerified: row.organizer_verified,
      })),
    };
  });

  app.post('/admin/v1/events/:id/review', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(reviewSchema, request.body);
    const status = body.action === 'approve' ? 'published' : 'rejected';
    const note = body.action === 'reject' ? (body.note ?? null) : null;
    const decided = await inTransaction(pool, async (client) => {
      const found = await client.query<{ user_id: string; title: string; before: string }>(
        `SELECT user_id, title, review_status AS before FROM adoption_events
         WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const event = found.rows[0];
      if (!event) throw new HttpError(404, 'Evento não encontrado.');
      await client.query(
        `UPDATE adoption_events SET review_status = $2, review_note = $3, updated_at = now()
         WHERE id = $1`,
        [id, status, note],
      );
      await recordChange(
        client,
        id,
        session.user_id,
        body.action === 'approve' ? 'approved' : 'rejected',
        {
          note,
        },
      );
      await writeAudit(client, {
        actorId: session.user_id,
        action: `event.review_${body.action}`,
        targetType: 'event',
        targetId: id,
        before: { reviewStatus: event.before },
        after: { reviewStatus: status, note },
        ...trail(request),
      });
      return event;
    });
    if (decided.before !== status) {
      await notifyPeople(pool, env, [decided.user_id], 'event_review', {
        title: status === 'published' ? 'Seu evento está na agenda' : 'Seu evento não foi aprovado',
        body:
          status === 'published'
            ? `${decided.title} foi aprovado e já aparece para todo mundo.`
            : `${decided.title} não foi aprovado: ${note ?? ''}`.trim(),
        route: `/evento/${id}`,
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:event-review' }, 'best-effort');
      });
    }
    return { reviewStatus: status };
  });

  app.post('/admin/v1/events/:id/visibility', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(visibilitySchema, request.body);
    await inTransaction(pool, async (client) => {
      const found = await client.query<{ hidden: boolean }>(
        `SELECT hidden FROM adoption_events WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const event = found.rows[0];
      if (!event) throw new HttpError(404, 'Evento não encontrado.');
      await client.query(
        `UPDATE adoption_events SET hidden = $2, updated_at = now() WHERE id = $1`,
        [id, body.hidden],
      );
      // Esconder resolve as denúncias abertas; mostrar de novo não reabre nada.
      if (body.hidden) {
        await client.query(
          `UPDATE event_reports SET status = 'resolved' WHERE event_id = $1 AND status = 'open'`,
          [id],
        );
      }
      await recordChange(client, id, session.user_id, body.hidden ? 'hidden' : 'unhidden');
      await writeAudit(client, {
        actorId: session.user_id,
        action: body.hidden ? 'event.hide' : 'event.unhide',
        targetType: 'event',
        targetId: id,
        before: { hidden: event.hidden },
        after: { hidden: body.hidden, justification: body.justification },
        ...trail(request),
      });
    });
    return { hidden: body.hidden };
  });

  app.post('/admin/v1/events/:id/reports', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    parse(reportsSchema, request.body);
    const updated = await pool.query(
      `UPDATE event_reports SET status = 'resolved' WHERE event_id = $1 AND status = 'open'`,
      [id],
    );
    await writeAudit(pool, {
      actorId: session.user_id,
      action: 'event.reports_dismiss',
      targetType: 'event',
      targetId: id,
      after: { dismissed: updated.rowCount ?? 0 },
      ...trail(request),
    });
    return { dismissed: updated.rowCount ?? 0 };
  });
}
