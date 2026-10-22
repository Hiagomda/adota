import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import { HttpError } from './http.js';
import { canSeeExactPlace } from './privacy.js';
import type { SessionUser } from './session.js';

/**
 * Contact between people happens on WhatsApp, outside the app: the app only hands over the
 * number of someone who said yes to showing it. Numbers never ride on the feed for adoption
 * or Casa Amiga; each one is asked for here, one at a time, under a per-account limit.
 */

const adoptionStatuses = new Set(['for_adoption', 'adopted']);

export interface AuthorContactGate {
  viewer: SessionUser;
  authorId: string;
  status: string;
  viewerWillHelp: boolean;
  /** Post type. Older callers leave it out. */
  type?: string;
}

/**
 * Adoption is open to anyone signed in, and so is a lost pet still missing: whoever saw or took
 * it in calls the family. A rescue only to who can already see its exact pin.
 */
export function canAskAuthorContact(gate: AuthorContactGate): boolean {
  if (gate.viewer.id === gate.authorId) return false;
  return (
    adoptionStatuses.has(gate.status) ||
    (gate.type === 'lost' && gate.status !== 'rescued') ||
    canSeeExactPlace(gate.viewer, gate.authorId, gate.viewerWillHelp)
  );
}

interface PostGate {
  id: string;
  author_id: string;
  status: string;
  type: string;
  species: string;
  author_phone: string | null;
  author_whatsapp: boolean;
  viewer_will_help: boolean;
}

interface HomeRow {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  foster_pet_types: string[];
  foster_max_days: number | null;
  phone: string;
}

const postParams = z.object({ id: z.string().uuid() });
const homeParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const HOMES_LIMIT = 20;

function params<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'Esse resgate não existe mais.');
  return parsed.data;
}

async function loadPost(pool: Pool, postId: string, viewerId: string): Promise<PostGate> {
  const result = await pool.query<PostGate>(
    `SELECT p.id, p.author_id, p.status, p.type, a.species,
            u.phone AS author_phone, u.whatsapp_opt_in AS author_whatsapp,
            EXISTS (
              SELECT 1 FROM responses r
              WHERE r.post_id = p.id AND r.user_id = $2 AND r.kind = 'will_help'
            ) AS viewer_will_help
     FROM posts p
     JOIN animals a ON a.id = p.animal_id
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1
       AND p.hidden = false
       AND p.review_status = 'published'
       AND u.deleted_at IS NULL
       AND u.suspended = false`,
    [postId, viewerId],
  );
  const post = result.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe mais.');
  return post;
}

async function blocked(pool: Pool, left: string, right: string): Promise<boolean> {
  const found = await pool.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [left, right],
  );
  return (found.rowCount ?? 0) > 0;
}

/** People offering Casa Amiga for this species who agreed to show their WhatsApp. */
async function homesFor(pool: Pool, post: PostGate, viewerId: string, onlyUser?: string) {
  const result = await pool.query<HomeRow>(
    `SELECT u.id, u.name, u.handle, u.verified, v.foster_pet_types, v.foster_max_days, u.phone
     FROM volunteer_profiles v
     JOIN users u ON u.id = v.user_id
     WHERE v.is_foster_available = true
       AND v.foster_pet_types ? $1
       AND u.whatsapp_opt_in = true
       AND u.phone IS NOT NULL
       AND u.deleted_at IS NULL
       AND u.suspended = false
       AND u.id <> $2
       AND ($3::uuid IS NULL OR u.id = $3)
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id)
       )
     ORDER BY u.verified DESC, u.name ASC
     LIMIT ${HOMES_LIMIT}`,
    [post.species, viewerId, onlyUser ?? null],
  );
  return result.rows;
}

function canSeeHomes(viewer: SessionUser, post: PostGate): boolean {
  return viewer.id === post.author_id || isOperator(viewer.role) || post.viewer_will_help;
}

export function registerContactRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; contactLimit: { config: object } },
): void {
  const { pool, contactLimit } = deps;

  app.post('/posts/:id/contact', contactLimit, async (request: FastifyRequest) => {
    const viewer = requireUser(request.user);
    const { id } = params(postParams, request.params);
    const post = await loadPost(pool, id, viewer.id);
    const allowed = canAskAuthorContact({
      viewer,
      authorId: post.author_id,
      status: post.status,
      viewerWillHelp: post.viewer_will_help,
      type: post.type,
    });
    if (!allowed) {
      throw new HttpError(403, 'Diga "vou ajudar" no resgate para ver o contato de quem publicou.');
    }
    if (
      !post.author_whatsapp ||
      !post.author_phone ||
      (await blocked(pool, viewer.id, post.author_id))
    ) {
      throw new HttpError(404, 'Essa pessoa ainda não liberou o WhatsApp.');
    }
    return { phone: post.author_phone };
  });

  // Same people who see the exact pin; no address and no distance, the meeting is arranged on
  // WhatsApp. The number is not in this list: it comes from the contact route below.
  app.get('/posts/:id/foster-homes', async (request) => {
    const viewer = request.user;
    if (!viewer) return { homes: [] };
    const { id } = params(postParams, request.params);
    const post = await loadPost(pool, id, viewer.id);
    if (!canSeeHomes(viewer, post)) return { homes: [] };
    const homes = await homesFor(pool, post, viewer.id);
    return {
      homes: homes.map((home) => ({
        id: home.id,
        name: home.name,
        handle: home.handle,
        verified: home.verified,
        petTypes: home.foster_pet_types,
        maxDays: home.foster_max_days,
      })),
    };
  });

  app.post(
    '/posts/:id/foster-homes/:userId/contact',
    contactLimit,
    async (request: FastifyRequest) => {
      const viewer = requireUser(request.user);
      const { id, userId } = params(homeParams, request.params);
      const post = await loadPost(pool, id, viewer.id);
      if (!canSeeHomes(viewer, post)) {
        throw new HttpError(403, 'Diga "vou ajudar" no resgate para falar com uma Casa Amiga.');
      }
      const [home] = await homesFor(pool, post, viewer.id, userId);
      if (!home) throw new HttpError(404, 'Essa Casa Amiga não está mais disponível.');
      return { phone: home.phone };
    },
  );
}
