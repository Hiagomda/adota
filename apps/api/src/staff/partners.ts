import { nextPartnerStatus, partnerReviewSchema } from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { inTransaction } from '../events.js';
import { HttpError } from '../http.js';
import { notifyPeople } from '../notify.js';
import { partnerColumns, publicPartner, type PartnerRow } from '../partners.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const idSchema = z.object({ id: z.string().uuid() });

const listSchema = z
  .object({
    filter: z.enum(['pending', 'approved', 'paused', 'rejected']).default('pending'),
  })
  .strict();

const featureSchema = z.object({ featured: z.boolean() }).strict();

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
 * Parceiros no painel da equipe: aprovar ou recusar o pedido, pausar quem recebeu denúncia e
 * escolher os destaques do feed. Usa a mesma permissão de moderar posts e grava cada decisão na
 * auditoria. Quem pediu recebe aviso com o resultado.
 */
export function registerPartnerModerationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.get('/admin/v1/partners', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const query = parse(listSchema, request.query ?? {});
    const result = await pool.query<
      PartnerRow & { owner_handle: string; owner_name: string; owner_verified: boolean }
    >(
      `SELECT ${partnerColumns}, u.handle AS owner_handle, u.name AS owner_name,
              u.verified AS owner_verified
       FROM partners p
       JOIN users u ON u.id = p.user_id
       WHERE p.status = $1
       ORDER BY ${query.filter === 'pending' ? 'p.updated_at ASC' : 'p.updated_at DESC'}
       LIMIT 100`,
      [query.filter],
    );
    return {
      partners: result.rows.map((row) => ({
        ...publicPartner(row),
        status: row.status,
        paused: row.owner_paused,
        reviewNote: row.review_note,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        ownerId: row.user_id,
        ownerHandle: row.owner_handle,
        ownerName: row.owner_name,
        ownerVerified: row.owner_verified,
      })),
    };
  });

  app.post('/admin/v1/partners/:id/review', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(partnerReviewSchema, request.body);
    const note = body.action === 'approve' ? null : (body.note ?? null);
    const decided = await inTransaction(pool, async (client) => {
      const found = await client.query<{
        user_id: string;
        name: string;
        status: Parameters<typeof nextPartnerStatus>[0];
        featured: boolean;
      }>(`SELECT user_id, name, status, featured FROM partners WHERE id = $1 FOR UPDATE`, [id]);
      const partner = found.rows[0];
      if (!partner) throw new HttpError(404, 'Parceiro não encontrado.');
      const status = nextPartnerStatus(partner.status, body.action);
      if (!status) throw new HttpError(409, 'Esse pedido já mudou. Atualize a lista.');
      const featured = status === 'approved' ? (body.featured ?? partner.featured) : false;
      await client.query(
        `UPDATE partners SET status = $2, review_note = $3, featured = $4, reviewed_by = $5,
                reviewed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, status, note, featured, session.user_id],
      );
      await writeAudit(client, {
        actorId: session.user_id,
        action: `partner.review_${body.action}`,
        targetType: 'partner',
        targetId: id,
        before: { status: partner.status, featured: partner.featured },
        after: { status, featured, note },
        ...trail(request),
      });
      return { ...partner, status };
    });
    const messages = {
      approved: {
        title: 'Você é Parceiro do Cupu!',
        body: `${decided.name} já aparece no mapa do Égua, adota!.`,
      },
      rejected: {
        title: 'Seu pedido de parceiro não foi aprovado',
        body: `${decided.name}: ${note ?? ''}`.trim(),
      },
      paused: {
        title: 'Seu cadastro de parceiro foi pausado',
        body: `${decided.name} saiu do mapa: ${note ?? ''}`.trim(),
      },
    } as const;
    const message = decided.status === 'pending' ? null : messages[decided.status];
    if (message) {
      await notifyPeople(pool, env, [decided.user_id], 'partner_review', {
        ...message,
        route: '/parceiros',
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:partner-review' }, 'best-effort');
      });
    }
    return { status: decided.status };
  });

  // Liga e desliga o destaque no feed sem mexer na aprovação.
  app.post('/admin/v1/partners/:id/feature', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const { featured } = parse(featureSchema, request.body);
    await inTransaction(pool, async (client) => {
      const updated = await client.query<{ before: boolean }>(
        `UPDATE partners p SET featured = $2, updated_at = now()
         FROM (SELECT featured FROM partners WHERE id = $1 FOR UPDATE) old
         WHERE p.id = $1 AND p.status = 'approved'
         RETURNING old.featured AS before`,
        [id, featured],
      );
      const row = updated.rows[0];
      if (!row) throw new HttpError(409, 'Só parceiro aprovado vai para o destaque.');
      await writeAudit(client, {
        actorId: session.user_id,
        action: 'partner.feature',
        targetType: 'partner',
        targetId: id,
        before: { featured: row.before },
        after: { featured },
        ...trail(request),
      });
    });
    return { featured };
  });
}
