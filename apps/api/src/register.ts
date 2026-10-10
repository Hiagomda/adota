import {
  animalStatusSchema,
  claimVolunteerXpSchema,
  createPostSchema,
  feedQuerySchema,
  presignSchema,
  responseKindSchema,
  updateMeSchema,
  volunteerSettingsSchema,
} from '@patinha/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';
import {
  anonymizeUser,
  createDevUser,
  findUserByFirebaseUid,
  profileByHandle,
  updateProfile,
} from './accounts.js';
import { requireAdmin, requireUser } from './authz.js';
import type { Env } from './config.js';
import { addResponse, changeStatus, createPost, getPost, listPosts } from './feed.js';
import { ensureFirebaseApp, firebaseChecksRevocation } from './firebaseAdmin.js';
import { reverseAddress } from './geocode.js';
import { HttpError } from './http.js';
import { publicMediaUrl, presignUploads, verifyUploadedImages } from './media.js';
import { assertOwnedMedia } from './mediaPolicy.js';
import {
  enqueueRescueAlert,
  notifyComment,
  notifyDiaryNote,
  notifyStatusChange,
  type createQueue,
} from './notify.js';
import { publicUser, rowsOf, type SessionUser } from './session.js';
import { claimVolunteerXp, saveVolunteerSettings, volunteerStatus } from './volunteers.js';
import { stripControls } from './text.js';

type RescueQueue = ReturnType<typeof createQueue>;

const devLoginSchema = z.object({ email: z.string().trim().email() });
const commentSchema = z.object({
  body: z.string().trim().min(1).max(500).transform(stripControls),
  parentCommentId: z.string().uuid().optional(),
});
const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
const fosterSchema = z.object({
  capacity: z.number().int().positive().max(20),
  speciesAccepted: z.array(z.enum(['dog', 'cat', 'other'])).min(1),
  sizesAccepted: z.array(z.enum(['small', 'medium', 'large'])).min(1),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  radiusKm: z.number().positive().max(50),
});
const adoptionSchema = z.object({ body: z.string().trim().min(20).max(4000) });
const verificationSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).optional(),
});

export async function registerRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; queue: RescueQueue; storage: S3Client },
): Promise<void> {
  const { env, pool, queue, storage } = deps;
  const db = drizzle(pool);

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    request.user = await resolveUser(env, pool, request.headers.authorization);
  });

  app.get('/auth/config', async () => ({
    devMode: env.authDevMode,
    firebase: Boolean(env.FIREBASE_PROJECT_ID),
  }));

  app.post(
    '/auth/dev-login',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      if (!env.authDevMode) throw new HttpError(404, 'Esse acesso não está disponível.');
      const { email } = parse(devLoginSchema, request.body);
      const existing = await findUserByFirebaseUid(pool, `dev:${email}`);
      const user = existing ?? (await createDevUser(pool, email));
      return { token: `dev:${email}`, user: publicUser(user) };
    },
  );

  app.get('/me', async (request) => publicUser(requireUser(request.user)));

  app.get('/volunteers/me', async (request) => {
    const user = requireUser(request.user);
    return volunteerStatus(pool, user.id);
  });

  app.put('/volunteers/settings', async (request) => {
    const user = requireUser(request.user);
    return saveVolunteerSettings(pool, user.id, parse(volunteerSettingsSchema, request.body));
  });

  app.post('/volunteers/actions/claim-xp', async (request) => {
    const user = requireUser(request.user);
    return claimVolunteerXp(pool, user.id, parse(claimVolunteerXpSchema, request.body));
  });

  app.patch('/me', async (request) => {
    const user = requireUser(request.user);
    const patch = parse(updateMeSchema, request.body);
    if (patch.avatarUrl?.startsWith('uploads/')) {
      assertOwnedMedia(user.id, [patch.avatarUrl]);
      patch.avatarUrl = publicMediaUrl(env, patch.avatarUrl, 'thumb');
    }
    await updateProfile(pool, user.id, patch);
    const fresh = await findUserByFirebaseUid(pool, user.firebaseUid);
    if (!fresh) throw new HttpError(404, 'Essa conta não existe.');
    return publicUser(fresh);
  });

  app.post('/me/fcm-token', async (request) => {
    const user = requireUser(request.user);
    const { token } = parse(z.object({ token: z.string().min(8).max(512) }), request.body);
    await pool.query(
      `UPDATE users SET fcm_tokens = (
         SELECT ARRAY(SELECT DISTINCT unnest(fcm_tokens || ARRAY[$2]::text[]))
       ) WHERE id = $1`,
      [user.id, token],
    );
    return { ok: true };
  });

  app.delete('/me', async (request, reply) => {
    const user = requireUser(request.user);
    await anonymizeUser(pool, user.id);
    return reply.code(204).send();
  });

  app.post('/me/verification', async (request, reply) => {
    const user = requireUser(request.user);
    const body = parse(verificationSchema, request.body);
    await pool.query(
      `INSERT INTO verification_requests (user_id, organization_name, note) VALUES ($1, $2, $3)`,
      [user.id, body.organizationName, body.note ?? null],
    );
    return reply.code(201).send({ status: 'pending' });
  });

  app.get('/users/:handle', async (request) => {
    const { handle } = parse(
      z.object({ handle: z.string().trim().min(1).max(40) }),
      request.params,
    );
    return profileByHandle(db, pool, handle, request.user?.id ?? null);
  });

  app.post('/users/:id/follow', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    if (id === user.id) throw new HttpError(400, 'Você não pode seguir a própria conta.');
    await pool.query(
      `INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, id],
    );
    return { following: true };
  });

  app.delete('/users/:id/follow', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    await pool.query(`DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2`, [
      user.id,
      id,
    ]);
    return { following: false };
  });

  app.post('/users/:id/block', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    if (id === user.id) throw new HttpError(400, 'Você não pode bloquear a própria conta.');
    await pool.query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, id],
    );
    await pool.query(
      `DELETE FROM follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)`,
      [user.id, id],
    );
    return { blocked: true };
  });

  app.delete('/users/:id/block', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    await pool.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [user.id, id]);
    return { blocked: false };
  });

  app.post(
    '/uploads/presign',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const user = requireUser(request.user);
      const body = parse(presignSchema, request.body);
      return { uploads: await presignUploads(env, storage, user.id, body.files) };
    },
  );

  app.get(
    '/geocode/reverse',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const query = parse(
        z.object({
          latitude: z.coerce.number().gte(-90).lte(90),
          longitude: z.coerce.number().gte(-180).lte(180),
        }),
        request.query,
      );
      try {
        const address = await reverseAddress(query.latitude, query.longitude);
        return { address };
      } catch {
        return { address: null };
      }
    },
  );

  app.get('/posts', async (request) => {
    const query = parse(feedQuerySchema, request.query);
    return listPosts(pool, env, query, request.user);
  });

  app.get('/stories', async (request) => {
    const query = parse(
      z.object({
        latitude: z.coerce.number().optional(),
        longitude: z.coerce.number().optional(),
      }),
      request.query,
    );
    return listPosts(
      pool,
      env,
      {
        limit: 12,
        latitude: query.latitude,
        longitude: query.longitude,
        radiusKm: query.latitude !== undefined ? 25 : undefined,
        urgency: 'high',
        status: 'open',
      },
      request.user,
    );
  });

  app.get('/posts/:id', async (request) => {
    const id = resourceId(request.params);
    return getPost(pool, env, id, request.user);
  });

  app.post(
    '/posts',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request.user);
      const body = parse(createPostSchema, request.body);
      if (!body.parentPostId) {
        await verifyUploadedImages(
          env,
          storage,
          user.id,
          body.media.map((item) => item.url),
        );
      }
      const created = await createPost(pool, env, user, body);
      if (
        body.type === 'rescue_alert' &&
        created.reviewStatus === 'published' &&
        !body.parentPostId
      ) {
        await enqueueRescueAlert(queue, created.id, body.urgency).catch(() => undefined);
      }
      if (body.parentPostId && created.reviewStatus === 'published') {
        await notifyDiaryNote(
          pool,
          env,
          body.parentPostId,
          user.id,
          stripControls(body.description),
        ).catch(() => undefined);
      }
      return reply.code(201).send(created);
    },
  );

  app.patch('/posts/:id/status', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    const body = parse(z.object({ status: animalStatusSchema }), request.body);
    await changeStatus(pool, id, user, body.status);
    await notifyStatusChange(pool, env, id, body.status).catch(() => undefined);
    return { status: body.status };
  });

  app.post(
    '/posts/:id/responses',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request.user);
      const id = resourceId(request.params);
      const body = parse(
        z.object({ kind: responseKindSchema, note: z.string().max(300).optional() }),
        request.body,
      );
      await addResponse(pool, id, user, body.kind, body.note);
      return reply.code(201).send({ ok: true });
    },
  );

  app.get('/posts/:id/comments', async (request) => {
    const id = resourceId(request.params);
    const result = await pool.query(
      `SELECT c.id, c.body, c.created_at, c.parent_comment_id,
              u.id AS user_id, u.name, u.handle, u.avatar_url,
              parent_user.handle AS parent_handle
       FROM comments c
       JOIN users u ON u.id = c.user_id
       JOIN posts p ON p.id = c.post_id
       LEFT JOIN comments parent ON parent.id = c.parent_comment_id
       LEFT JOIN users parent_user ON parent_user.id = parent.user_id
       WHERE c.post_id = $1
         AND c.hidden = false
         AND p.hidden = false
         AND p.review_status = 'published'
         AND u.deleted_at IS NULL
         AND u.suspended = false
         AND (
           $2::uuid IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $2 AND b.blocked_id = c.user_id)
                OR (b.blocker_id = c.user_id AND b.blocked_id = $2)
           )
         )
       ORDER BY c.created_at ASC`,
      [id, request.user?.id ?? null],
    );
    return {
      comments: rowsOf<{
        id: string;
        body: string;
        created_at: Date;
        parent_comment_id: string | null;
        parent_handle: string | null;
        user_id: string;
        name: string;
        handle: string;
        avatar_url: string | null;
      }>(result).map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at.toISOString(),
        parentCommentId: comment.parent_comment_id,
        parentHandle: comment.parent_handle,
        author: {
          id: comment.user_id,
          name: comment.name,
          handle: comment.handle,
          avatarUrl: comment.avatar_url,
        },
      })),
    };
  });

  app.post(
    '/posts/:id/comments',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request.user);
      const id = resourceId(request.params);
      const body = parse(commentSchema, request.body);
      let parentAuthorId: string | null = null;
      if (body.parentCommentId) {
        const parent = await pool.query<{ user_id: string }>(
          `SELECT user_id FROM comments
           WHERE id = $1 AND post_id = $2 AND hidden = false`,
          [body.parentCommentId, id],
        );
        const parentRow = parent.rows[0];
        if (!parentRow) throw new HttpError(404, 'Esse comentário não existe mais.');
        parentAuthorId = parentRow.user_id;
      }
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO comments (post_id, user_id, body, parent_comment_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, user.id, body.body, body.parentCommentId ?? null],
      );
      await notifyComment(pool, env, id, user.id, body.body, parentAuthorId);
      return reply.code(201).send({ id: inserted.rows[0]?.id });
    },
  );

  app.post('/posts/:id/like', async (request) => toggle(pool, 'likes', request));
  app.post('/posts/:id/save', async (request) => toggle(pool, 'saves', request));

  app.post('/posts/:id/follow', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    await pool.query(
      `INSERT INTO post_follows (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, id],
    );
    return { following: true };
  });

  app.delete('/posts/:id/follow', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    await pool.query(`DELETE FROM post_follows WHERE user_id = $1 AND post_id = $2`, [user.id, id]);
    return { following: false };
  });

  app.post('/posts/:id/story-view', async (request) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    await pool.query(
      `INSERT INTO story_views (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, id],
    );
    return { viewed: true };
  });

  app.get('/posts/:id/fosters', async (request) => {
    const id = resourceId(request.params);
    const result = await pool.query(
      `SELECT u.id, u.name, u.handle, u.verified, f.capacity,
              ST_Distance(f.location, p.location) AS meters
       FROM fosters f
       JOIN users u ON u.id = f.user_id
       JOIN posts p ON p.id = $1
       WHERE f.available = true
         AND ST_DWithin(f.location, p.location, f.radius_km * 1000)
       ORDER BY meters ASC
       LIMIT 10`,
      [id],
    );
    return {
      fosters: rowsOf<{
        id: string;
        name: string;
        handle: string;
        verified: boolean;
        capacity: number;
        meters: number;
      }>(result).map((foster) => ({
        id: foster.id,
        name: foster.name,
        handle: foster.handle,
        verified: foster.verified,
        capacity: foster.capacity,
        distanceKm: Math.round((foster.meters / 1000) * 10) / 10,
      })),
    };
  });

  app.post('/fosters', async (request) => {
    const user = requireUser(request.user);
    const body = parse(fosterSchema, request.body);
    await pool.query(
      `INSERT INTO fosters (user_id, capacity, species_accepted, sizes_accepted, location, radius_km, available)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, true)
       ON CONFLICT (user_id) DO UPDATE SET
         capacity = EXCLUDED.capacity,
         species_accepted = EXCLUDED.species_accepted,
         sizes_accepted = EXCLUDED.sizes_accepted,
         location = EXCLUDED.location,
         radius_km = EXCLUDED.radius_km,
         available = true`,
      [
        user.id,
        body.capacity,
        body.speciesAccepted,
        body.sizesAccepted,
        body.longitude,
        body.latitude,
        body.radiusKm,
      ],
    );
    return { available: true };
  });

  app.post('/posts/:id/adoption-term', async (request, reply) => {
    const user = requireUser(request.user);
    const id = resourceId(request.params);
    const body = parse(adoptionSchema, request.body);
    const post = await pool.query<{ status: string }>(`SELECT status FROM posts WHERE id = $1`, [
      id,
    ]);
    if (post.rows[0]?.status !== 'for_adoption') {
      throw new HttpError(400, 'O termo só vale quando o animal está para adoção.');
    }
    await pool.query(
      `INSERT INTO adoption_terms (post_id, user_id, body) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET body = EXCLUDED.body, accepted_at = now()`,
      [id, user.id, body.body],
    );
    return reply.code(201).send({ accepted: true });
  });

  app.get('/notifications', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query(
      `SELECT id, type, payload, read_at, created_at FROM notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [user.id],
    );
    return {
      notifications: rowsOf<{
        id: string;
        type: string;
        payload: unknown;
        read_at: Date | null;
        created_at: Date;
      }>(result).map((item) => ({
        id: item.id,
        type: item.type,
        payload: item.payload,
        readAt: item.read_at?.toISOString() ?? null,
        createdAt: item.created_at.toISOString(),
      })),
    };
  });

  app.post('/notifications/read', async (request) => {
    const user = requireUser(request.user);
    await pool.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [user.id],
    );
    return { ok: true };
  });

  app.post(
    '/reports',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request.user);
      const body = parse(reportSchema, request.body);
      await pool.query(
        `INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES ($1, $2, $3, $4)`,
        [user.id, body.targetType, body.targetId, body.reason],
      );
      return reply.code(201).send({ status: 'open' });
    },
  );

  app.get('/admin/reports', async (request) => {
    requireAdmin(request.user);
    const result = await pool.query(
      `SELECT id, reporter_id, target_type, target_id, reason, status, created_at
       FROM reports WHERE status = 'open' ORDER BY created_at ASC LIMIT 100`,
    );
    return { reports: result.rows };
  });

  app.post('/admin/reports/:id', async (request) => {
    requireAdmin(request.user);
    const id = resourceId(request.params);
    const body = parse(z.object({ action: z.enum(['hide', 'dismiss']) }), request.body);
    const report = await pool.query<{ target_type: string; target_id: string }>(
      `SELECT target_type, target_id FROM reports WHERE id = $1`,
      [id],
    );
    const target = report.rows[0];
    if (!target) throw new HttpError(404, 'Denúncia não encontrada.');
    if (body.action === 'hide') {
      if (target.target_type === 'post') {
        await pool.query(`UPDATE posts SET hidden = true WHERE id = $1`, [target.target_id]);
      }
      if (target.target_type === 'comment') {
        await pool.query(`UPDATE comments SET hidden = true WHERE id = $1`, [target.target_id]);
      }
      if (target.target_type === 'user') {
        await pool.query(`UPDATE users SET suspended = true WHERE id = $1`, [target.target_id]);
      }
    }
    await pool.query(`UPDATE reports SET status = $2 WHERE id = $1`, [
      id,
      body.action === 'hide' ? 'hidden' : 'dismissed',
    ]);
    return { status: body.action === 'hide' ? 'hidden' : 'dismissed' };
  });

  app.get('/admin/verifications', async (request) => {
    requireAdmin(request.user);
    const result = await pool.query(
      `SELECT v.id, v.organization_name, v.note, v.status, v.created_at, u.handle, u.name
       FROM verification_requests v JOIN users u ON u.id = v.user_id
       WHERE v.status = 'pending' ORDER BY v.created_at ASC`,
    );
    return { verifications: result.rows };
  });

  app.post('/admin/verifications/:id', async (request) => {
    requireAdmin(request.user);
    const id = resourceId(request.params);
    const body = parse(
      z.object({
        action: z.enum(['approve', 'reject']),
        role: z.enum(['ngo', 'protector']).default('ngo'),
      }),
      request.body,
    );
    const requestRow = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM verification_requests WHERE id = $1`,
      [id],
    );
    const userId = requestRow.rows[0]?.user_id;
    if (!userId) throw new HttpError(404, 'Pedido não encontrado.');
    if (body.action === 'approve') {
      await pool.query(`UPDATE users SET verified = true, role = $2 WHERE id = $1`, [
        userId,
        body.role,
      ]);
    }
    await pool.query(`UPDATE verification_requests SET status = $2 WHERE id = $1`, [
      id,
      body.action === 'approve' ? 'approved' : 'rejected',
    ]);
    return { status: body.action === 'approve' ? 'approved' : 'rejected' };
  });

  app.post('/admin/posts/:id/review', async (request) => {
    requireAdmin(request.user);
    const id = resourceId(request.params);
    const body = parse(z.object({ action: z.enum(['approve', 'reject']) }), request.body);
    const status = body.action === 'approve' ? 'published' : 'rejected';
    const updated = await pool.query<{ type: string; urgency: 'high' | 'medium' | 'low' }>(
      `UPDATE posts SET review_status = $2 WHERE id = $1 RETURNING type, urgency`,
      [id, status],
    );
    const post = updated.rows[0];
    if (!post) throw new HttpError(404, 'Alerta não encontrado.');
    if (status === 'published' && post.type === 'rescue_alert') {
      await enqueueRescueAlert(queue, id, post.urgency).catch(() => undefined);
    }
    return { reviewStatus: status };
  });

  app.post('/admin/users/:id/suspend', async (request) => {
    requireAdmin(request.user);
    const id = resourceId(request.params);
    const body = parse(z.object({ suspended: z.boolean() }), request.body);
    await pool.query(`UPDATE users SET suspended = $2 WHERE id = $1`, [id, body.suspended]);
    return { suspended: body.suspended };
  });

  app.get('/admin/metrics', async (request) => {
    requireAdmin(request.user);
    const byStatus = await pool.query(
      `SELECT status, count(*)::int AS total FROM posts
       WHERE type = 'rescue_alert' AND parent_post_id IS NULL GROUP BY status`,
    );
    const responseTime = await pool.query<{ seconds: number | null }>(
      `SELECT avg(EXTRACT(EPOCH FROM (r.created_at - p.created_at)))::float AS seconds
       FROM posts p
       JOIN responses r ON r.post_id = p.id AND r.kind = 'will_help'
       WHERE p.type = 'rescue_alert'`,
    );
    const adopted = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM posts WHERE status = 'adopted' AND parent_post_id IS NULL`,
    );
    return {
      alertsByStatus: byStatus.rows,
      meanSecondsToResponse: responseTime.rows[0]?.seconds ?? null,
      adopted: adopted.rows[0]?.total ?? 0,
    };
  });
}

async function toggle(
  pool: Pool,
  table: 'likes' | 'saves',
  request: { user: SessionUser | null; params: unknown },
) {
  const user = requireUser(request.user);
  const id = resourceId(request.params);
  const existing = await pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1 AND post_id = $2`, [
    user.id,
    id,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    await pool.query(`DELETE FROM ${table} WHERE user_id = $1 AND post_id = $2`, [user.id, id]);
    return { active: false };
  }
  await pool.query(`INSERT INTO ${table} (user_id, post_id) VALUES ($1, $2)`, [user.id, id]);
  return { active: true };
}

function resourceId(params: unknown): string {
  return parse(z.object({ id: z.string().uuid() }), params).id;
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
  return result.data;
}

async function resolveUser(
  env: Env,
  pool: Pool,
  authorization: string | undefined,
): Promise<SessionUser | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  if (env.authDevMode && token.startsWith('dev:')) {
    return findUserByFirebaseUid(pool, token);
  }
  if (!env.FIREBASE_PROJECT_ID) return null;
  try {
    await ensureFirebaseApp(env);
    const admin = await import('firebase-admin');
    const decoded = await admin.auth().verifyIdToken(token, firebaseChecksRevocation(env));
    const existing = await findUserByFirebaseUid(pool, decoded.uid);
    if (existing) return existing;
    const email = decoded.email ?? `${decoded.uid}@firebase.local`;
    const handle =
      email
        .split('@')[0]
        ?.replace(/[^a-z0-9]/g, '')
        .slice(0, 16) || 'pessoa';
    await pool.query(
      `INSERT INTO users (firebase_uid, name, handle, city) VALUES ($1, $2, $3, 'Belém')
       ON CONFLICT (firebase_uid) DO NOTHING`,
      [decoded.uid, decoded.name ?? 'Pessoa', `${handle}${decoded.uid.slice(0, 4)}`],
    );
    return findUserByFirebaseUid(pool, decoded.uid);
  } catch {
    return null;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}
