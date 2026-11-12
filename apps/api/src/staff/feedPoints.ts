import { feedPointReviewSchema, nextFeedPointStatus, type FeedPointStatus } from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { inTransaction } from '../events.js';
import { feedPointColumns, publicFeedPoint, type FeedPointRow } from '../feedPoints.js';
import { HttpError } from '../http.js';
import { notifyPeople } from '../notify.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });

const listSchema = z
  .object({
    filter: z.enum(['pending', 'approved', 'rejected', 'removed']).default('pending'),
  })
  .strict();

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function trail(request: FastifyRequest) {
  return { ip: clientIp(request), userAgent: userAgent(request) };
}

/**
 * Pontos solidários no painel da equipe: conferir o que chegou, tirar do mapa o que não existe
 * mais e devolver o que saiu por engano. Usa a permissão de moderar posts e grava cada decisão
 * na auditoria. Quem cadastrou recebe aviso com o resultado.
 */
export function registerFeedPointModerationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.get('/admin/v1/feed-points', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const query = parse(listSchema, request.query ?? {});
    const result = await pool.query<
      FeedPointRow & {
        owner_handle: string;
        owner_name: string;
        owner_verified: boolean;
        gone_reports: number;
        empty_reports: number;
      }
    >(
      `SELECT ${feedPointColumns}, u.handle AS owner_handle, u.name AS owner_name,
              u.verified AS owner_verified,
              (SELECT count(*)::int FROM feed_point_reports r
               WHERE r.feed_point_id = f.id AND r.report = 'gone') AS gone_reports,
              (SELECT count(*)::int FROM feed_point_reports r
               WHERE r.feed_point_id = f.id AND r.report = 'empty') AS empty_reports
       FROM feed_points f
       JOIN users u ON u.id = f.user_id
       WHERE f.status = $1
       ORDER BY ${query.filter === 'pending' ? 'f.updated_at ASC' : 'f.updated_at DESC'}
       LIMIT 100`,
      [query.filter],
    );
    return {
      points: result.rows.map((row) => ({
        ...publicFeedPoint(env, row),
        status: row.status,
        reviewNote: row.review_note,
        updatedAt: row.updated_at.toISOString(),
        ownerId: row.user_id,
        ownerHandle: row.owner_handle,
        ownerName: row.owner_name,
        ownerVerified: row.owner_verified,
        goneReports: row.gone_reports,
        emptyReports: row.empty_reports,
      })),
    };
  });

  app.post('/admin/v1/feed-points/:id/review', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(feedPointReviewSchema, request.body);
    const note = body.action === 'approve' ? null : (body.note ?? null);
    const decided = await inTransaction(pool, async (client) => {
      const found = await client.query<{
        user_id: string;
        address_text: string;
        status: FeedPointStatus;
      }>(`SELECT user_id, address_text, status FROM feed_points WHERE id = $1 FOR UPDATE`, [id]);
      const point = found.rows[0];
      if (!point) throw new HttpError(404, 'Ponto não encontrado.');
      const status = nextFeedPointStatus(point.status, body.action);
      if (!status) throw new HttpError(409, 'Esse ponto já mudou. Atualize a lista.');
      await client.query(
        `UPDATE feed_points SET status = $2, review_note = $3, reviewed_by = $4,
                reviewed_at = now(), updated_at = now(),
                last_checked_at = CASE WHEN $2 = 'approved' THEN now() ELSE last_checked_at END
         WHERE id = $1`,
        [id, status, note, session.user_id],
      );
      // Voltou ao mapa: os "não existe mais" antigos não contam de novo.
      if (status === 'approved') {
        await client.query(
          `DELETE FROM feed_point_reports WHERE feed_point_id = $1 AND report = 'gone'`,
          [id],
        );
      }
      await writeAudit(client, {
        actorId: session.user_id,
        action: `feed_point.review_${body.action}`,
        targetType: 'feed_point',
        targetId: id,
        before: { status: point.status },
        after: { status, note },
        ...trail(request),
      });
      return { ...point, from: point.status, status };
    });
    const messages: Partial<Record<FeedPointStatus, { title: string; body: string }>> = {
      approved: {
        title: 'Seu ponto solidário está no mapa',
        body: `${decided.address_text} já aparece para todo mundo. Obrigado por cuidar!`,
      },
      rejected: {
        title: 'Seu ponto solidário não foi aprovado',
        body: `${decided.address_text}: ${note ?? ''}`.trim(),
      },
      removed: {
        title: 'Seu ponto solidário saiu do mapa',
        body: `${decided.address_text}: ${note ?? ''}`.trim(),
      },
    };
    const message = messages[decided.status];
    if (message) {
      await notifyPeople(pool, env, [decided.user_id], 'feed_point_review', {
        ...message,
        route: '/pontos',
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:feed-point-review' }, 'best-effort');
      });
    }
    return { status: decided.status };
  });
}
