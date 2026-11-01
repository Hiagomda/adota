import { campaignCreateSchemaAt, communityEventSchema } from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator } from '../authz.js';
import { createCampaign } from '../campaigns.js';
import type { Env } from '../config.js';
import { createCommunityEvent } from '../events.js';
import { HttpError } from '../http.js';
import { notifyPeople } from '../notify.js';
import { assertPermission } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

const ownerSchema = z.object({
  ownerHandle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .refine((value) => value === '' || /^[a-z0-9._]{3,24}$/.test(value), {
      message: 'Escreva o @ do responsável, sem link.',
    })
    .optional(),
});

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
 * A equipe também cria eventos e campanhas pelo painel. O evento sai em nome da conta da equipe
 * e entra na agenda sem esperar aprovação (para quem pode marcar a categoria). A campanha fica
 * em nome do responsável pelo Pix, que confirma as doações no app; sem @, fica com a própria
 * conta da equipe. Tudo vai para a auditoria.
 */
export function registerStaffCreateRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.post('/admin/v1/events', async (request, reply) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const input = parse(communityEventSchema, request.body);
    const author = await pool.query<{ verified: boolean }>(
      `SELECT verified FROM users WHERE id = $1`,
      [session.user_id],
    );
    const created = await createCommunityEvent(
      pool,
      { id: session.user_id, role: session.role, verified: author.rows[0]?.verified ?? false },
      input,
    );
    if (!created.repeated) {
      await writeAudit(pool, {
        actorId: session.user_id,
        action: 'event.create',
        targetType: 'event',
        targetId: created.id,
        after: { title: input.title, category: input.category, startsAt: input.startsAt },
        ...trail(request),
      });
    }
    return reply
      .code(created.repeated ? 200 : 201)
      .send({ id: created.id, reviewStatus: created.reviewStatus });
  });

  app.post('/admin/v1/campaigns', async (request, reply) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'campaigns.review');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const { ownerHandle, ...campaignBody } = body;
    const owner = parse(ownerSchema, { ownerHandle }).ownerHandle;
    const input = parse(campaignCreateSchemaAt(), campaignBody);

    let ownerId = session.user_id;
    if (owner) {
      const found = await pool.query<{
        id: string;
        verified: boolean;
        role: string;
        suspended: boolean;
      }>(
        `SELECT id, verified, role, suspended FROM users
         WHERE handle = $1 AND deleted_at IS NULL`,
        [owner],
      );
      const row = found.rows[0];
      if (!row) throw new HttpError(404, `Nenhuma conta com o @${owner}.`);
      if (row.suspended) throw new HttpError(409, `A conta @${owner} está suspensa.`);
      if (!row.verified && !isOperator(row.role)) {
        throw new HttpError(
          409,
          `@${owner} não é verificado. Só ONG ou protetor verificado tem campanha com Pix.`,
        );
      }
      ownerId = row.id;
    }

    const created = await createCampaign(pool, { id: ownerId }, input, {
      id: session.user_id,
      kind: 'staff',
    });
    if (!created.repeated) {
      await writeAudit(pool, {
        actorId: session.user_id,
        action: 'campaign.create',
        targetType: 'campaign',
        targetId: created.id,
        after: { title: input.title, goalCents: input.goalCents, owner: owner ?? null },
        ...trail(request),
      });
      if (ownerId !== session.user_id) {
        await notifyPeople(pool, env, [ownerId], 'campaign', {
          title: 'A equipe abriu uma campanha com você',
          body: `"${input.title}" já está no ar com o seu Pix. Confirme as doações pelo app.`,
          route: `/campanha/${created.id}`,
        }).catch((error: unknown) => {
          request.log.error({ err: error, where: 'notify:campaign-staff-create' }, 'best-effort');
        });
      }
    }
    return reply.code(created.repeated ? 200 : 201).send({ id: created.id });
  });
}
