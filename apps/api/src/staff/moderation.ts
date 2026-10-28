import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Env } from '../config.js';
import { HttpError } from '../http.js';
import { publicMediaUrl } from '../media.js';
import {
  enqueueRescueAlert,
  notifyReportResolved,
  notifyVerificationDecision,
  type createQueue,
} from '../notify.js';
import { formatCents, notifyCampaignSuspension, setCampaignSuspended } from '../campaigns.js';
import { rowsOf } from '../session.js';
import { assertPermission, isStaffRole } from './policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './routes.js';

type RescueQueue = ReturnType<typeof createQueue>;

const idSchema = z.object({ id: z.string().uuid() });

const reportListSchema = z
  .object({ status: z.enum(['open', 'hidden', 'dismissed']).default('open') })
  .strict();

const reportActionSchema = z.object({ action: z.enum(['hide', 'dismiss']) }).strict();

const verificationActionSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    // Sem papel, vale o que a pessoa pediu no cadastro.
    role: z.enum(['ngo', 'protector']).optional(),
  })
  .strict();

const postListSchema = z
  .object({
    filter: z.enum(['pending', 'hidden', 'recent']).default('pending'),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

const reviewSchema = z.object({ action: z.enum(['approve', 'reject']) }).strict();

const visibilitySchema = z
  .object({
    hidden: z.boolean(),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

const campaignListSchema = z
  .object({ filter: z.enum(['reported', 'active', 'suspended', 'all']).default('reported') })
  .strict();

const campaignStatusSchema = z
  .object({
    suspended: z.boolean(),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

const userListSchema = z.object({ q: z.string().trim().max(80).optional() }).strict();

const suspendSchema = z
  .object({
    suspended: z.boolean(),
    justification: z.string().trim().min(10).max(500),
  })
  .strict();

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
  return result.data;
}

/** Busca por texto livre: escapa os curingas do ILIKE para a pessoa não montar padrão. */
function likePattern(q: string | undefined): string | null {
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function trail(request: FastifyRequest) {
  return { ip: clientIp(request), userAgent: userAgent(request) };
}

/**
 * Moderação pelo painel da equipe. Usa a sessão do painel (TOTP) e grava cada decisão na
 * auditoria. As rotas antigas `/admin/*` com o token do app continuam iguais.
 */
/** Status em que o animal já saiu da rua. */
const SAFE_STATUSES = ['rescued', 'fostered', 'for_adoption', 'adopted'];

/**
 * Como terminaram os avisos de resgate dos últimos 30 dias: quantos foram publicados, quantos
 * chegaram a um lugar seguro e em quanto tempo (mediana, do aviso ao primeiro status seguro).
 */
export async function rescueOutcomes(pool: Pool): Promise<{
  created: number;
  safe: number;
  stillOpen: number;
  notFound: number;
  medianHoursToSafe: number | null;
}> {
  const result = await pool.query<{
    created: number;
    safe: number;
    still_open: number;
    not_found: number;
    median_seconds: number | null;
  }>(
    `WITH recent AS (
       SELECT p.id, p.status, p.created_at,
         (SELECT min(u.created_at) FROM posts u
           WHERE u.parent_post_id = p.id AND u.type = 'update'
             AND u.status = ANY($1::text[])) AS safe_at
       FROM posts p
       WHERE p.type = 'rescue_alert' AND p.parent_post_id IS NULL AND p.hidden = false
         AND p.created_at > now() - interval '30 days'
     )
     SELECT
       count(*)::int AS created,
       count(*) FILTER (WHERE status = ANY($1::text[]))::int AS safe,
       count(*) FILTER (WHERE status IN ('open', 'on_the_way'))::int AS still_open,
       count(*) FILTER (WHERE status = 'not_found')::int AS not_found,
       (percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (safe_at - created_at))
       ) FILTER (WHERE safe_at IS NOT NULL))::float AS median_seconds
     FROM recent`,
    [SAFE_STATUSES],
  );
  const row = result.rows[0];
  const median = row?.median_seconds ?? null;
  return {
    created: row?.created ?? 0,
    safe: row?.safe ?? 0,
    stillOpen: row?.still_open ?? 0,
    notFound: row?.not_found ?? 0,
    medianHoursToSafe: median === null ? null : Math.round((median / 3600) * 10) / 10,
  };
}

export function registerModerationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; queue: RescueQueue },
): void {
  const { env, pool, queue } = deps;

  app.get('/admin/v1/overview', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'overview.read');
    const result = await pool.query<{
      users_total: number;
      users_week: number;
      users_suspended: number;
      posts_week: number;
      alerts_open: number;
      adopted: number;
      pending_review: number;
      open_reports: number;
      pending_verifications: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users_total,
         (SELECT count(*)::int FROM users
           WHERE deleted_at IS NULL AND created_at > now() - interval '7 days') AS users_week,
         (SELECT count(*)::int FROM users
           WHERE deleted_at IS NULL AND suspended = true) AS users_suspended,
         (SELECT count(*)::int FROM posts
           WHERE parent_post_id IS NULL AND created_at > now() - interval '7 days') AS posts_week,
         (SELECT count(*)::int FROM posts
           WHERE type = 'rescue_alert' AND parent_post_id IS NULL AND hidden = false
             AND status IN ('open', 'on_the_way')) AS alerts_open,
         (SELECT count(*)::int FROM posts
           WHERE status = 'adopted' AND parent_post_id IS NULL) AS adopted,
         (SELECT count(*)::int FROM posts WHERE review_status = 'pending') AS pending_review,
         (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports,
         (SELECT count(*)::int FROM verification_requests
           WHERE status = 'pending') AS pending_verifications`,
    );
    const responseTime = await pool.query<{ seconds: number | null }>(
      `SELECT avg(EXTRACT(EPOCH FROM (r.created_at - p.created_at)))::float AS seconds
       FROM posts p
       JOIN responses r ON r.post_id = p.id AND r.kind = 'will_help'
       WHERE p.type = 'rescue_alert' AND p.created_at > now() - interval '30 days'`,
    );
    const rescues = await rescueOutcomes(pool);
    const row = result.rows[0];
    return {
      usersTotal: row?.users_total ?? 0,
      usersThisWeek: row?.users_week ?? 0,
      usersSuspended: row?.users_suspended ?? 0,
      postsThisWeek: row?.posts_week ?? 0,
      alertsOpen: row?.alerts_open ?? 0,
      adopted: row?.adopted ?? 0,
      pendingReview: row?.pending_review ?? 0,
      openReports: row?.open_reports ?? 0,
      pendingVerifications: row?.pending_verifications ?? 0,
      meanSecondsToResponse: responseTime.rows[0]?.seconds ?? null,
      rescues30d: rescues,
    };
  });

  app.get('/admin/v1/reports', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'reports.manage');
    const query = parse(reportListSchema, request.query ?? {});
    const result = await pool.query<{
      id: string;
      target_type: 'post' | 'comment' | 'user' | 'campaign';
      target_id: string;
      reason: string;
      status: string;
      created_at: Date;
      reporter_handle: string | null;
      target_text: string | null;
      target_handle: string | null;
      target_hidden: boolean | null;
      report_count: number;
    }>(
      `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
              reporter.handle AS reporter_handle,
              CASE r.target_type
                WHEN 'post' THEN left(p.description, 280)
                WHEN 'comment' THEN left(c.body, 280)
                WHEN 'campaign' THEN left(cp.title || ': ' || cp.purpose, 280)
                ELSE tu.name
              END AS target_text,
              CASE r.target_type
                WHEN 'post' THEN pa.handle
                WHEN 'comment' THEN ca.handle
                WHEN 'campaign' THEN cpo.handle
                ELSE tu.handle
              END AS target_handle,
              CASE r.target_type
                WHEN 'post' THEN p.hidden
                WHEN 'comment' THEN c.hidden
                WHEN 'campaign' THEN cp.status = 'suspended'
                ELSE tu.suspended
              END AS target_hidden,
              (SELECT count(*)::int FROM reports same
                WHERE same.target_id = r.target_id AND same.target_type = r.target_type) AS report_count
       FROM reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
       LEFT JOIN users pa ON pa.id = p.author_id
       LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
       LEFT JOIN users ca ON ca.id = c.user_id
       LEFT JOIN users tu ON r.target_type = 'user' AND tu.id = r.target_id
       LEFT JOIN campaigns cp ON r.target_type = 'campaign' AND cp.id = r.target_id
       LEFT JOIN users cpo ON cpo.id = cp.owner_id
       WHERE r.status = $1
       ORDER BY r.created_at ${query.status === 'open' ? 'ASC' : 'DESC'}
       LIMIT 100`,
      [query.status],
    );
    return {
      reports: rowsOf<(typeof result.rows)[number]>(result).map((row) => ({
        id: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        reporterHandle: row.reporter_handle,
        targetText: row.target_text,
        targetHandle: row.target_handle,
        targetHidden: row.target_hidden,
        reportCount: row.report_count,
      })),
    };
  });

  app.post('/admin/v1/reports/:id', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'reports.manage');
    const id = parse(idSchema, request.params).id;
    const body = parse(reportActionSchema, request.body);
    const status = body.action === 'hide' ? 'hidden' : 'dismissed';
    const client = await pool.connect();
    let reporterId: string;
    let suspendedCampaign: { id: string; ownerId: string } | null = null;
    try {
      await client.query('BEGIN');
      const report = await client.query<{
        target_type: string;
        target_id: string;
        reporter_id: string;
        status: string;
      }>(
        `SELECT target_type, target_id, reporter_id, status FROM reports WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const target = report.rows[0];
      if (!target) throw new HttpError(404, 'Denúncia não encontrada.');
      if (target.status !== 'open') {
        throw new HttpError(409, 'Outra pessoa já resolveu essa denúncia. Atualize a lista.');
      }
      if (body.action === 'hide') {
        if (target.target_type === 'post') {
          await client.query(`UPDATE posts SET hidden = true WHERE id = $1`, [target.target_id]);
        }
        if (target.target_type === 'comment') {
          await client.query(`UPDATE comments SET hidden = true WHERE id = $1`, [target.target_id]);
        }
        if (target.target_type === 'user') {
          await client.query(`UPDATE users SET suspended = true WHERE id = $1`, [target.target_id]);
        }
        if (target.target_type === 'campaign') {
          const changed = await setCampaignSuspended(client, {
            campaignId: target.target_id,
            actorId: session.user_id,
            suspended: true,
            reason: 'Denúncia aceita pela equipe.',
          });
          if (changed?.changed) {
            suspendedCampaign = { id: target.target_id, ownerId: changed.ownerId };
          }
        }
      }
      await client.query(`UPDATE reports SET status = $2 WHERE id = $1`, [id, status]);
      await writeAudit(client, {
        actorId: session.user_id,
        action: `report.${body.action}`,
        targetType: target.target_type,
        targetId: target.target_id,
        before: { report: id, status: 'open' },
        after: { report: id, status },
        ...trail(request),
      });
      await client.query('COMMIT');
      reporterId = target.reporter_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await notifyReportResolved(pool, reporterId, body.action).catch((error: unknown) => {
      request.log.error({ err: error, where: 'notify:report' }, 'best-effort step failed');
    });
    if (suspendedCampaign) {
      await notifyCampaignSuspension(
        pool,
        env,
        suspendedCampaign.id,
        suspendedCampaign.ownerId,
        true,
      ).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:campaign' }, 'best-effort step failed');
      });
    }
    return { status };
  });

  // Campanhas para a revisão financeira: as denunciadas primeiro, com os números do livro-caixa.
  app.get('/admin/v1/campaigns', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'campaigns.review');
    const query = parse(campaignListSchema, request.query ?? {});
    const where =
      query.filter === 'reported'
        ? `EXISTS (SELECT 1 FROM reports r WHERE r.target_type = 'campaign'
             AND r.target_id = c.id AND r.status = 'open')`
        : query.filter === 'active'
          ? `c.status = 'active'`
          : query.filter === 'suspended'
            ? `c.status = 'suspended'`
            : 'true';
    const result = await pool.query<{
      id: string;
      title: string;
      status: string;
      goal_cents: number;
      deadline: string;
      created_at: Date;
      owner_handle: string;
      owner_name: string;
      raised: string;
      spent: string;
      pending: number;
      open_reports: number;
    }>(
      `SELECT c.id, c.title, c.status, c.goal_cents, to_char(c.deadline, 'YYYY-MM-DD') AS deadline,
              c.created_at, u.handle AS owner_handle, u.name AS owner_name,
              COALESCE(sum(e.amount_cents) FILTER (WHERE e.kind = 'donation' AND e.status = 'confirmed'), 0)::text AS raised,
              COALESCE(sum(e.amount_cents) FILTER (WHERE e.kind = 'expense' AND e.status = 'confirmed'), 0)::text AS spent,
              count(e.id) FILTER (WHERE e.status = 'pending')::int AS pending,
              (SELECT count(*)::int FROM reports r WHERE r.target_type = 'campaign'
                AND r.target_id = c.id AND r.status = 'open') AS open_reports
       FROM campaigns c
       JOIN users u ON u.id = c.owner_id
       LEFT JOIN campaign_entries e ON e.campaign_id = c.id
       WHERE ${where}
       GROUP BY c.id, u.id
       ORDER BY open_reports DESC, c.updated_at DESC
       LIMIT 100`,
    );
    return {
      campaigns: result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        goalCents: row.goal_cents,
        goal: formatCents(row.goal_cents),
        raisedCents: Number(row.raised),
        spentCents: Number(row.spent),
        pendingCount: row.pending,
        openReports: row.open_reports,
        deadline: row.deadline,
        ownerHandle: row.owner_handle,
        ownerName: row.owner_name,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });

  app.post('/admin/v1/campaigns/:id/status', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'campaigns.review');
    const id = parse(idSchema, request.params).id;
    const body = parse(campaignStatusSchema, request.body);
    const client = await pool.connect();
    let changed: Awaited<ReturnType<typeof setCampaignSuspended>> = null;
    try {
      await client.query('BEGIN');
      changed = await setCampaignSuspended(client, {
        campaignId: id,
        actorId: session.user_id,
        suspended: body.suspended,
        reason: body.justification,
      });
      if (!changed) throw new HttpError(404, 'Campanha não encontrada.');
      if (changed.changed) {
        await writeAudit(client, {
          actorId: session.user_id,
          action: body.suspended ? 'campaign.suspend' : 'campaign.reinstate',
          targetType: 'campaign',
          targetId: id,
          before: { suspended: !body.suspended },
          after: { suspended: body.suspended, justification: body.justification },
          ...trail(request),
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (changed.changed) {
      await notifyCampaignSuspension(pool, env, id, changed.ownerId, body.suspended).catch(
        (error: unknown) => {
          request.log.error({ err: error, where: 'notify:campaign' }, 'best-effort step failed');
        },
      );
    }
    return { suspended: body.suspended, changed: changed.changed };
  });

  app.get('/admin/v1/verifications', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'verifications.manage');
    const result = await pool.query<{
      id: string;
      organization_name: string;
      note: string | null;
      created_at: Date;
      kind: string;
      instagram: string | null;
      cnpj: string | null;
      neighborhood: string | null;
      user_id: string;
      handle: string;
      name: string;
      role: string;
      verified: boolean;
    }>(
      `SELECT v.id, v.organization_name, v.note, v.created_at, v.kind, v.instagram, v.cnpj,
              v.neighborhood, u.id AS user_id, u.handle, u.name, u.role, u.verified
       FROM verification_requests v JOIN users u ON u.id = v.user_id
       WHERE v.status = 'pending' AND u.deleted_at IS NULL
       ORDER BY v.created_at ASC
       LIMIT 100`,
    );
    return {
      verifications: rowsOf<(typeof result.rows)[number]>(result).map((row) => ({
        id: row.id,
        organizationName: row.organization_name,
        note: row.note,
        createdAt: row.created_at.toISOString(),
        kind: row.kind,
        instagram: row.instagram,
        cnpj: row.cnpj,
        neighborhood: row.neighborhood,
        userId: row.user_id,
        handle: row.handle,
        name: row.name,
        role: row.role,
        verified: row.verified,
      })),
    };
  });

  app.post('/admin/v1/verifications/:id', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'verifications.manage');
    const id = parse(idSchema, request.params).id;
    const body = parse(verificationActionSchema, request.body);
    const status = body.action === 'approve' ? 'approved' : 'rejected';
    let decided: string | null = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{
        user_id: string;
        status: string;
        role: string;
        kind: 'ngo' | 'protector';
      }>(
        `SELECT v.user_id, v.status, u.role, v.kind
         FROM verification_requests v JOIN users u ON u.id = v.user_id
         WHERE v.id = $1 FOR UPDATE OF v`,
        [id],
      );
      const found = row.rows[0];
      if (!found) throw new HttpError(404, 'Pedido não encontrado.');
      if (found.status !== 'pending') {
        throw new HttpError(409, 'Outra pessoa já analisou esse pedido. Atualize a lista.');
      }
      const role = body.role ?? found.kind;
      decided = found.user_id;
      if (body.action === 'approve') {
        // Conta da equipe continua com o papel dela: só ganha o selo de verificada.
        if (isStaffRole(found.role)) {
          await client.query(`UPDATE users SET verified = true WHERE id = $1`, [found.user_id]);
        } else {
          await client.query(`UPDATE users SET verified = true, role = $2 WHERE id = $1`, [
            found.user_id,
            role,
          ]);
        }
      }
      await client.query(
        `UPDATE verification_requests SET status = $2, decided_at = now() WHERE id = $1`,
        [id, status],
      );
      await writeAudit(client, {
        actorId: session.user_id,
        action: `verification.${body.action}`,
        targetType: 'user',
        targetId: found.user_id,
        before: { request: id, role: found.role },
        after: { request: id, status, role: body.action === 'approve' ? role : found.role },
        ...trail(request),
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (decided) {
      await notifyVerificationDecision(pool, decided, body.action).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:verification' }, 'best-effort step failed');
      });
    }
    return { status };
  });

  app.get('/admin/v1/posts', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const query = parse(postListSchema, request.query ?? {});
    const where =
      query.filter === 'pending'
        ? `p.review_status = 'pending'`
        : query.filter === 'hidden'
          ? `p.hidden = true`
          : `p.parent_post_id IS NULL`;
    const result = await pool.query<{
      id: string;
      type: string;
      urgency: string;
      status: string;
      review_status: string;
      hidden: boolean;
      description: string;
      approx_label: string;
      created_at: Date;
      author_id: string;
      author_handle: string;
      author_name: string;
      animal_name: string | null;
      species: string;
      cover: string | null;
    }>(
      `SELECT p.id, p.type, p.urgency, p.status, p.review_status, p.hidden,
              left(p.description, 400) AS description, p.approx_label, p.created_at,
              u.id AS author_id, u.handle AS author_handle, u.name AS author_name,
              a.name AS animal_name, a.species,
              (SELECT m.url FROM post_media m WHERE m.post_id = p.id
                ORDER BY m.position ASC LIMIT 1) AS cover
       FROM posts p
       JOIN users u ON u.id = p.author_id
       JOIN animals a ON a.id = p.animal_id
       WHERE ${where}
         AND ($1::text IS NULL OR p.description ILIKE $1 OR u.handle ILIKE $1 OR a.name ILIKE $1)
       ORDER BY p.created_at DESC
       LIMIT 60`,
      [likePattern(query.q)],
    );
    return {
      posts: rowsOf<(typeof result.rows)[number]>(result).map((row) => ({
        id: row.id,
        type: row.type,
        urgency: row.urgency,
        status: row.status,
        reviewStatus: row.review_status,
        hidden: row.hidden,
        description: row.description,
        approxLabel: row.approx_label,
        createdAt: row.created_at.toISOString(),
        authorId: row.author_id,
        authorHandle: row.author_handle,
        authorName: row.author_name,
        animalName: row.animal_name,
        species: row.species,
        thumbUrl: row.cover ? publicMediaUrl(env, row.cover, 'thumb') : null,
      })),
    };
  });

  app.post('/admin/v1/posts/:id/review', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(reviewSchema, request.body);
    const status = body.action === 'approve' ? 'published' : 'rejected';
    const updated = await pool.query<{
      type: string;
      urgency: 'high' | 'medium' | 'low';
      before: string;
    }>(
      `UPDATE posts p SET review_status = $2
       FROM (SELECT id, review_status FROM posts WHERE id = $1 FOR UPDATE) old
       WHERE p.id = old.id
       RETURNING p.type, p.urgency, old.review_status AS before`,
      [id, status],
    );
    const post = updated.rows[0];
    if (!post) throw new HttpError(404, 'Post não encontrado.');
    await writeAudit(pool, {
      actorId: session.user_id,
      action: `post.review_${body.action}`,
      targetType: 'post',
      targetId: id,
      before: { reviewStatus: post.before },
      after: { reviewStatus: status },
      ...trail(request),
    });
    if (status === 'published' && post.before !== 'published' && post.type === 'rescue_alert') {
      await enqueueRescueAlert(queue, id, post.urgency).catch((error: unknown) => {
        request.log.error({ err: error, where: 'queue:rescue-alert' }, 'best-effort step failed');
      });
    }
    return { reviewStatus: status };
  });

  app.post('/admin/v1/posts/:id/visibility', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const id = parse(idSchema, request.params).id;
    const body = parse(visibilitySchema, request.body);
    const updated = await pool.query<{ before: boolean }>(
      `UPDATE posts p SET hidden = $2
       FROM (SELECT id, hidden FROM posts WHERE id = $1 FOR UPDATE) old
       WHERE p.id = old.id
       RETURNING old.hidden AS before`,
      [id, body.hidden],
    );
    const post = updated.rows[0];
    if (!post) throw new HttpError(404, 'Post não encontrado.');
    await writeAudit(pool, {
      actorId: session.user_id,
      action: body.hidden ? 'post.hide' : 'post.unhide',
      targetType: 'post',
      targetId: id,
      before: { hidden: post.before },
      after: { hidden: body.hidden, justification: body.justification },
      ...trail(request),
    });
    return { hidden: body.hidden };
  });

  app.get('/admin/v1/users', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'users.read');
    const query = parse(userListSchema, request.query ?? {});
    // Sem telefone nem e-mail: a busca serve para moderar, não para contatar.
    const result = await pool.query<{
      id: string;
      name: string;
      handle: string;
      role: string;
      verified: boolean;
      suspended: boolean;
      created_at: Date;
      posts: number;
      open_reports: number;
    }>(
      `SELECT u.id, u.name, u.handle, u.role, u.verified, u.suspended, u.created_at,
              (SELECT count(*)::int FROM posts p
                WHERE p.author_id = u.id AND p.parent_post_id IS NULL) AS posts,
              (SELECT count(*)::int FROM reports r
                WHERE r.target_type = 'user' AND r.target_id = u.id AND r.status = 'open') AS open_reports
       FROM users u
       WHERE u.deleted_at IS NULL
         AND ($1::text IS NULL OR u.name ILIKE $1 OR u.handle ILIKE $1)
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [likePattern(query.q)],
    );
    return {
      users: rowsOf<(typeof result.rows)[number]>(result).map((row) => ({
        id: row.id,
        name: row.name,
        handle: row.handle,
        role: row.role,
        verified: row.verified,
        suspended: row.suspended,
        createdAt: row.created_at.toISOString(),
        posts: row.posts,
        openReports: row.open_reports,
      })),
    };
  });

  app.post('/admin/v1/users/:id/suspend', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'users.suspend');
    const id = parse(idSchema, request.params).id;
    const body = parse(suspendSchema, request.body);
    if (id === session.user_id)
      throw new HttpError(403, 'Você não pode suspender a própria conta.');
    const current = await pool.query<{ role: string; suspended: boolean }>(
      `SELECT role, suspended FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const target = current.rows[0];
    if (!target) throw new HttpError(404, 'Essa conta não existe.');
    // Conta da equipe sai pela tela Equipe, que pede a senha e encerra as sessões.
    if (isStaffRole(target.role)) {
      throw new HttpError(403, 'Conta da equipe: mude o papel na tela Equipe antes.');
    }
    await pool.query(`UPDATE users SET suspended = $2 WHERE id = $1`, [id, body.suspended]);
    await writeAudit(pool, {
      actorId: session.user_id,
      action: body.suspended ? 'user.suspend' : 'user.unsuspend',
      targetType: 'user',
      targetId: id,
      before: { suspended: target.suspended },
      after: { suspended: body.suspended, justification: body.justification },
      ...trail(request),
    });
    return { suspended: body.suspended };
  });
}
