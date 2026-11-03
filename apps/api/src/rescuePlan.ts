import {
  planApplies,
  rescueNeedKindSchema,
  rescueNeedMarkBodySchema,
  rescuePlan,
  type RescueNeed,
  type RescueNeedKind,
  type StoredRescueNeedMark,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import { HttpError } from './http.js';
import type { SessionUser } from './session.js';

type RouteLimit = { config: object };

export interface PlanCase {
  id: string;
  type: string;
  status: string;
  urgency: 'low' | 'medium' | 'high';
  health_notes: string | null;
  going: number;
  foster_stay: 'requested' | 'approved' | null;
}

const needKinds = new Set<string>(rescueNeedKindSchema.options);

/**
 * Planos de vários casos de uma vez (a central lê dezenas): duas consultas, ofertas e marcas,
 * para todos os ids juntos.
 */
export async function plansFor(
  pool: Pool,
  cases: readonly PlanCase[],
): Promise<Map<string, RescueNeed[]>> {
  const plans = new Map<string, RescueNeed[]>();
  const ids = cases.filter((item) => planApplies(item.type, item.status)).map((item) => item.id);
  if (ids.length === 0) return plans;
  const [offers, marks] = await Promise.all([
    pool.query<{ post_id: string; kind: string; offered: number; accepted: number }>(
      `SELECT post_id, kind,
              count(*) FILTER (WHERE status = 'offered')::int AS offered,
              count(*) FILTER (WHERE status = 'accepted')::int AS accepted
       FROM rescue_help_offers
       WHERE post_id = ANY($1::uuid[]) AND status IN ('offered', 'accepted')
       GROUP BY post_id, kind`,
      [ids],
    ),
    pool.query<{ post_id: string; kind: RescueNeedKind; mark: StoredRescueNeedMark }>(
      'SELECT post_id, kind, mark FROM rescue_need_marks WHERE post_id = ANY($1::uuid[])',
      [ids],
    ),
  ]);
  for (const item of cases) {
    if (!planApplies(item.type, item.status)) continue;
    const offerCounts: Partial<Record<RescueNeedKind, { offered: number; accepted: number }>> = {};
    for (const row of offers.rows) {
      if (row.post_id !== item.id || !needKinds.has(row.kind)) continue;
      offerCounts[row.kind as RescueNeedKind] = { offered: row.offered, accepted: row.accepted };
    }
    const caseMarks: Partial<Record<RescueNeedKind, StoredRescueNeedMark>> = {};
    for (const row of marks.rows) if (row.post_id === item.id) caseMarks[row.kind] = row.mark;
    plans.set(
      item.id,
      rescuePlan({
        status: item.status,
        urgency: item.urgency,
        healthNotes: item.health_notes,
        goingCount: item.going,
        offers: offerCounts,
        fosterStay: item.foster_stay,
        marks: caseMarks,
      }),
    );
  }
  return plans;
}

interface PlanPost extends PlanCase {
  author_id: string;
}

async function planPost(pool: Pool, postId: string): Promise<PlanPost> {
  const found = await pool.query<PlanPost>(
    `SELECT p.id, p.type, p.status, p.urgency, p.author_id, a.health_notes,
            (SELECT count(*)::int FROM responses r WHERE r.post_id = p.id AND r.kind = 'will_help') AS going,
            (SELECT CASE WHEN bool_or(fs.status = 'approved') THEN 'approved' ELSE 'requested' END
             FROM foster_stays fs
             WHERE fs.post_id = p.id AND fs.status IN ('requested', 'approved')
             HAVING count(*) > 0) AS foster_stay
     FROM posts p
     JOIN animals a ON a.id = p.animal_id
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
       AND p.review_status = 'published' AND u.deleted_at IS NULL`,
    [postId],
  );
  const post = found.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe.');
  return post;
}

/** O plano de um resgate, para o detalhe do post. Vazio quando o caso já não é de rua. */
export async function loadPlan(pool: Pool, postId: string, viewer: SessionUser | null) {
  const post = await planPost(pool, postId);
  const plans = await plansFor(pool, [post]);
  const needs = plans.get(post.id) ?? [];
  return {
    applies: planApplies(post.type, post.status),
    canManage: viewer !== null && (viewer.id === post.author_id || isOperator(viewer.role)),
    needs,
  };
}

/** A necessidade daquele tipo no plano do caso, ou null se o caso não tem plano ou não a lista. */
export async function needFor(
  pool: Pool,
  postId: string,
  kind: string,
): Promise<RescueNeed | null> {
  if (!needKinds.has(kind)) return null;
  const post = await planPost(pool, postId);
  const plans = await plansFor(pool, [post]);
  return plans.get(post.id)?.find((need) => need.kind === kind) ?? null;
}

const markParams = z.object({ id: z.string().uuid(), kind: rescueNeedKindSchema });
const idParams = z.object({ id: z.string().uuid() });

export function registerRescuePlanRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; writeLimit: RouteLimit },
): void {
  const { pool, writeLimit } = deps;

  app.get('/posts/:id/plan', async (request) => {
    const parsed = idParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse resgate não existe.');
    return loadPlan(pool, parsed.data.id, request.user);
  });

  // Quem publicou e a equipe marcam: resolvido, não precisa, precisa ou volta para a regra.
  app.put('/posts/:id/plan/:kind', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const params = markParams.safeParse(request.params);
    if (!params.success) throw new HttpError(404, 'Essa necessidade não existe.');
    const body = rescueNeedMarkBodySchema.safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'Escolha o que marcar.');
    const { id, kind } = params.data;
    const post = await planPost(pool, id);
    if (user.id !== post.author_id && !isOperator(user.role)) {
      throw new HttpError(403, 'Só quem publicou ou a equipe muda o plano.');
    }
    if (!planApplies(post.type, post.status)) {
      throw new HttpError(400, 'Esse caso já não tem plano de ação.');
    }
    if (body.data.mark === 'auto') {
      await pool.query('DELETE FROM rescue_need_marks WHERE post_id = $1 AND kind = $2', [
        id,
        kind,
      ]);
    } else {
      await pool.query(
        `INSERT INTO rescue_need_marks (post_id, kind, mark, marked_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (post_id, kind)
         DO UPDATE SET mark = EXCLUDED.mark, marked_by = EXCLUDED.marked_by, marked_at = now()`,
        [id, kind, body.data.mark, user.id],
      );
    }
    return loadPlan(pool, id, user);
  });
}
