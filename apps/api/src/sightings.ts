import { insideServiceArea, looksLikeAnimalSale } from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { reverseNeighborhood } from './geocode.js';
import { HttpError } from './http.js';
import { notifySighting } from './notify.js';
import { canSeeExactPlace } from './privacy.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

/** A rescue can be seen elsewhere only while it is still on the street. */
const streetStatuses = new Set(['open', 'on_the_way', 'not_found']);
/** Per person and rescue, so nobody floods a rescue with pins. */
const SIGHTINGS_PER_DAY = 5;
const LABEL_TIMEOUT_MS = 3000;
const LIST_LIMIT = 20;

const sightingSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  note: z.string().trim().max(200).optional(),
});

const postParams = z.object({ id: z.string().uuid() });

function postId(params: unknown): string {
  const parsed = postParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Esse resgate não existe mais.');
  return parsed.data.id;
}

/** The neighborhood if the lookup answers in time; the sighting is saved either way. */
async function labelFor(latitude: number, longitude: number, log: FastifyRequest['log']) {
  try {
    return await Promise.race([
      reverseNeighborhood(latitude, longitude),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LABEL_TIMEOUT_MS)),
    ]);
  } catch (error) {
    log.warn({ err: error }, 'sightings: neighborhood lookup failed');
    return null;
  }
}

interface SightingRow {
  id: string;
  approx_label: string | null;
  note: string | null;
  created_at: Date;
  name: string;
  handle: string;
  exact_lat: number;
  exact_lng: number;
  approx_lat: number;
  approx_lng: number;
}

export function registerSightingRoutes(
  app: FastifyInstance,
  deps: {
    env: Env;
    pool: Pool;
    writeLimit: { config: object };
    /** Avisado depois de cada avistamento salvo (busca de perdidos). */
    onSighting?: (postId: string) => Promise<void>;
  },
): void {
  const { env, pool, writeLimit, onSighting } = deps;

  app.post('/posts/:id/sightings', writeLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const id = postId(request.params);
    const body = sightingSchema.safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'Confira o ponto e a nota e tente de novo.');
    const { latitude, longitude } = body.data;
    if (!insideServiceArea({ latitude, longitude })) {
      throw new HttpError(400, 'Esse ponto fica fora de Belém.');
    }
    const note = body.data.note ? stripControls(body.data.note).trim() : '';
    if (note && looksLikeAnimalSale(note))
      throw new HttpError(400, 'Não é permitido vender animais.');

    const post = await pool.query<{ status: string }>(
      `SELECT p.status FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
         AND p.review_status = 'published' AND u.deleted_at IS NULL`,
      [id],
    );
    const status = post.rows[0]?.status;
    if (!status) throw new HttpError(404, 'Esse resgate não existe mais.');
    if (!streetStatuses.has(status)) {
      throw new HttpError(409, 'Esse animal já está seguro. Obrigado por olhar!');
    }
    const recent = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM sightings
       WHERE post_id = $1 AND user_id = $2 AND created_at > now() - interval '1 day'`,
      [id, user.id],
    );
    if ((recent.rows[0]?.count ?? 0) >= SIGHTINGS_PER_DAY) {
      throw new HttpError(429, 'Você já marcou este animal várias vezes hoje. Obrigado!');
    }

    // Tests never call the real map service.
    const label = env.NODE_ENV === 'test' ? null : await labelFor(latitude, longitude, request.log);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO sightings (post_id, user_id, location, approx_label, note)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6)
       RETURNING id`,
      [id, user.id, longitude, latitude, label, note || null],
    );
    await notifySighting(pool, env, id, user.id, label, note).catch((error: unknown) => {
      request.log.warn({ err: error }, 'sightings: notification failed');
    });
    await onSighting?.(id).catch((error: unknown) => {
      request.log.warn({ err: error }, 'sightings: lost-match queue failed');
    });
    return reply.code(201).send({ id: inserted.rows[0]?.id });
  });

  app.get('/posts/:id/sightings', async (request) => {
    const id = postId(request.params);
    const viewer: SessionUser | null = request.user;
    const post = await pool.query<{ author_id: string; viewer_will_help: boolean }>(
      `SELECT p.author_id,
              EXISTS (
                SELECT 1 FROM responses r
                WHERE r.post_id = p.id AND r.user_id = $2 AND r.kind = 'will_help'
              ) AS viewer_will_help
       FROM posts p WHERE p.id = $1 AND p.hidden = false`,
      [id, viewer?.id ?? null],
    );
    const gate = post.rows[0];
    if (!gate) return { sightings: [] };
    // Same rule as the rescue pin: the exact point only for who is going, the author and the team.
    const exact = canSeeExactPlace(viewer, gate.author_id, gate.viewer_will_help);
    const result = await pool.query<SightingRow>(
      `SELECT s.id, s.approx_label, s.note, s.created_at, u.name, u.handle,
              ST_Y(s.location::geometry) AS exact_lat, ST_X(s.location::geometry) AS exact_lng,
              ST_Y(ST_SnapToGrid(s.location::geometry, 0.005)::geometry) AS approx_lat,
              ST_X(ST_SnapToGrid(s.location::geometry, 0.005)::geometry) AS approx_lng
       FROM sightings s JOIN users u ON u.id = s.user_id
       WHERE s.post_id = $1 AND u.deleted_at IS NULL AND u.suspended = false
       ORDER BY s.created_at DESC
       LIMIT ${LIST_LIMIT}`,
      [id],
    );
    return {
      sightings: result.rows.map((row) => ({
        id: row.id,
        label: row.approx_label,
        note: row.note,
        createdAt: row.created_at.toISOString(),
        author: { name: row.name, handle: row.handle },
        location: exact
          ? { latitude: row.exact_lat, longitude: row.exact_lng, exact: true }
          : { latitude: row.approx_lat, longitude: row.approx_lng, exact: false },
      })),
    };
  });
}
