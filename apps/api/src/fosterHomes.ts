import {
  badgesForAction,
  fosterHomeSettingsSchema,
  fosterRequestSchema,
  fosterStayActionSchema,
  fosterStayTransition,
  freeSlots,
  looksLikeAnimalSale,
  type FosterStayStatus,
} from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { moveToFosterHome } from './feed.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyPeople, notifyStatusChange } from './notify.js';
import { resolveAnimal } from './passport.js';
import { fosterDistanceKm } from './privacy.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/**
 * Casas Amigas com vagas. A casa é de alguém: a localização nunca sai daqui, só a distância em
 * km inteiros (nunca menos de 1) para quem já vê o ponto exato do resgate. O pedido de
 * acolhimento passa pelo app; telefone só depois do aceite e se a pessoa liberou o WhatsApp.
 */

/** Onde o animal ainda precisa de um canto para ficar. */
const needsHomeStatuses = new Set(['open', 'on_the_way', 'not_found', 'rescued', 'for_adoption']);
const HOMES_LIMIT = 20;
const STAYS_LIMIT = 30;
/** Teto de XP automático por acolhimento, igual ao do "registrar lar temporário" manual. */
const MAX_XP_DAYS = 90;

const postParams = z.object({ id: z.string().uuid() });
const stayParams = z.object({ id: z.string().uuid(), action: fosterStayActionSchema });

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function postIdOf(params: unknown): string {
  const parsed = postParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Esse resgate não existe mais.');
  return parsed.data.id;
}

interface PostGate {
  id: string;
  author_id: string;
  status: string;
  type: string;
  species: string;
  size: string;
  animal_id: string;
  viewer_will_help: boolean;
}

async function loadPost(db: Pool | PoolClient, postId: string, viewerId: string) {
  const result = await db.query<PostGate>(
    `SELECT p.id, p.author_id, p.status, p.type, a.species, a.size, p.animal_id,
            EXISTS (
              SELECT 1 FROM responses r
              WHERE r.post_id = p.id AND r.user_id = $2 AND r.kind = 'will_help'
            ) AS viewer_will_help
     FROM posts p
     JOIN animals a ON a.id = p.animal_id
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
       AND p.review_status = 'published' AND u.deleted_at IS NULL AND u.suspended = false`,
    [postId, viewerId],
  );
  const post = result.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe mais.');
  return post;
}

/** As mesmas pessoas que veem o ponto exato: quem publicou, a equipe e quem disse "vou ajudar". */
function canUseHomes(viewer: SessionUser, post: PostGate): boolean {
  return viewer.id === post.author_id || isOperator(viewer.role) || post.viewer_will_help;
}

interface HomeRow {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  has_whatsapp: boolean;
  foster_pet_types: string[];
  foster_sizes: string[];
  foster_max_days: number | null;
  foster_capacity: number;
  foster_special_needs: boolean;
  foster_offers: string[];
  foster_notes: string | null;
  occupied: number;
  meters: number | null;
  my_request_id: string | null;
  my_request_status: FosterStayStatus | null;
}

interface StayRow {
  id: string;
  status: FosterStayStatus;
  message: string;
  response_note: string | null;
  expected_days: number | null;
  special_care: boolean;
  created_at: Date;
  decided_at: Date | null;
  ended_at: Date | null;
  post_id: string;
  approx_label: string;
  post_status: string;
  animal_id: string;
  animal_name: string | null;
  species: string;
  size: string;
  photo: string | null;
  foster_id: string;
  foster_name: string;
  foster_handle: string;
  requester_id: string | null;
  requester_name: string | null;
  requester_handle: string | null;
}

const staySelect = `
  SELECT s.id, s.status, s.message, s.response_note, s.expected_days, s.special_care,
         s.created_at, s.decided_at, s.ended_at,
         p.id AS post_id, p.approx_label, p.status AS post_status,
         a.id AS animal_id, a.name AS animal_name, a.species, a.size,
         (SELECT m.url FROM post_media m WHERE m.post_id = p.id ORDER BY m.position LIMIT 1) AS photo,
         f.id AS foster_id, f.name AS foster_name, f.handle AS foster_handle,
         r.id AS requester_id, r.name AS requester_name, r.handle AS requester_handle
  FROM foster_stays s
  JOIN posts p ON p.id = s.post_id
  JOIN animals a ON a.id = p.animal_id
  JOIN users f ON f.id = s.foster_id
  LEFT JOIN users r ON r.id = s.requested_by AND r.deleted_at IS NULL`;

function presentStay(env: Env, row: StayRow) {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    responseNote: row.response_note,
    expectedDays: row.expected_days,
    specialCare: row.special_care,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    post: { id: row.post_id, approxLabel: row.approx_label, status: row.post_status },
    animal: {
      id: row.animal_id,
      name: row.animal_name,
      species: row.species,
      size: row.size,
      photoUrl: row.photo ? publicMediaUrl(env, row.photo, 'thumb') : null,
    },
    foster: { id: row.foster_id, name: row.foster_name, handle: row.foster_handle },
    requester:
      row.requester_id && row.requester_name && row.requester_handle
        ? { id: row.requester_id, name: row.requester_name, handle: row.requester_handle }
        : null,
  };
}

interface ProfileRow {
  is_foster_available: boolean;
  foster_pet_types: string[];
  foster_sizes: string[];
  foster_max_days: number | null;
  foster_capacity: number;
  foster_special_needs: boolean;
  foster_offers: string[];
  foster_notes: string | null;
  service_radius_km: number;
}

async function occupiedSlots(db: Pool | PoolClient, fosterId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM foster_stays WHERE foster_id = $1 AND status = 'approved'`,
    [fosterId],
  );
  return result.rows[0]?.count ?? 0;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function animalWord(name: string | null, species: string): string {
  if (name) return name;
  return species === 'cat' ? 'o gato' : species === 'dog' ? 'o cachorro' : 'o animal';
}

/** Dias de acolhimento para o XP: do aceite ao fim, no mínimo 1. */
export function stayDays(decidedAt: Date, endedAt: Date): number {
  const days = Math.ceil((endedAt.getTime() - decidedAt.getTime()) / 86_400_000);
  return Math.min(MAX_XP_DAYS, Math.max(1, days));
}

/** XP de lar temporário entra sozinho quando o acolhimento termina; nunca duas vezes. */
async function awardFosterXp(client: PoolClient, fosterId: string, stayId: string, days: number) {
  const inserted = await client.query(
    `INSERT INTO user_xp_history (user_id, action_type, points, source_id)
     VALUES ($1, 'foster', $2, $3)
     ON CONFLICT (user_id, source_id) DO NOTHING`,
    [fosterId, 100 * days, `foster-stay:${stayId}`],
  );
  if ((inserted.rowCount ?? 0) === 0) return;
  const total = await client.query<{ xp: number }>(
    `SELECT COALESCE(SUM(points), 0)::int AS xp FROM user_xp_history WHERE user_id = $1`,
    [fosterId],
  );
  for (const code of badgesForAction('foster', total.rows[0]?.xp ?? 0)) {
    await client.query(
      `INSERT INTO user_badges (user_id, badge_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [fosterId, code],
    );
  }
}

function bestEffort(request: FastifyRequest, where: string) {
  return (error: unknown) => {
    request.log.error({ err: error, where }, 'best-effort step failed');
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function registerFosterHomeRoutes(
  app: FastifyInstance,
  deps: {
    env: Env;
    pool: Pool;
    writeLimit: RouteLimit;
    publishLimit: RouteLimit;
    contactLimit: RouteLimit;
  },
): void {
  const { env, pool, writeLimit, publishLimit, contactLimit } = deps;

  app.get('/me/casa-amiga', async (request) => {
    const user = requireUser(request.user);
    const profile = await pool.query<ProfileRow>(
      `SELECT is_foster_available, foster_pet_types, foster_sizes, foster_max_days, foster_capacity,
              foster_special_needs, foster_offers, foster_notes, service_radius_km
       FROM volunteer_profiles WHERE user_id = $1`,
      [user.id],
    );
    const row = profile.rows[0];
    const occupied = await occupiedSlots(pool, user.id);
    const capacity = row?.foster_capacity ?? 1;
    const received = await pool.query<StayRow>(
      `${staySelect} WHERE s.foster_id = $1 ORDER BY
         CASE s.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, s.created_at DESC
       LIMIT ${STAYS_LIMIT}`,
      [user.id],
    );
    const sent = await pool.query<StayRow>(
      `${staySelect} WHERE s.requested_by = $1 ORDER BY
         CASE s.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, s.created_at DESC
       LIMIT ${STAYS_LIMIT}`,
      [user.id],
    );
    const base = await pool.query<{ has_base: boolean }>(
      `SELECT base_location IS NOT NULL AS has_base FROM users WHERE id = $1`,
      [user.id],
    );
    return {
      settings: {
        isFosterAvailable: row?.is_foster_available ?? false,
        fosterPetTypes: row?.foster_pet_types ?? [],
        fosterSizes: row?.foster_sizes ?? ['small', 'medium', 'large'],
        fosterMaxDays: row?.foster_max_days ?? null,
        capacity,
        acceptsSpecialNeeds: row?.foster_special_needs ?? false,
        offers: row?.foster_offers ?? [],
        notes: row?.foster_notes ?? null,
        serviceRadiusKm: row?.service_radius_km ?? 10,
      },
      slots: { capacity, occupied, free: freeSlots(capacity, occupied) },
      // Sem ponto salvo, a casa aparece sem distância; o app pede para salvar a região.
      hasArea: base.rows[0]?.has_base ?? false,
      reachable: Boolean(user.phone && user.whatsappOptIn),
      received: received.rows.map((stay) => presentStay(env, stay)),
      sent: sent.rows.map((stay) => presentStay(env, stay)),
    };
  });

  app.put('/me/casa-amiga', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const input = parse(fosterHomeSettingsSchema, request.body);
    const notes = input.notes ? stripControls(input.notes).trim() : '';
    if (notes && looksLikeAnimalSale(notes)) {
      throw new HttpError(400, 'Não é permitido vender animais.');
    }
    const occupied = await occupiedSlots(pool, user.id);
    if (input.capacity < occupied) {
      throw new HttpError(
        409,
        `Você está acolhendo ${occupied} agora. A capacidade não pode ficar abaixo disso.`,
      );
    }
    await pool.query(
      `INSERT INTO volunteer_profiles (
         user_id, is_transport_available, is_foster_available, foster_pet_types, foster_max_days,
         service_radius_km, foster_sizes, foster_capacity, foster_special_needs, foster_offers,
         foster_notes, updated_at
       ) VALUES ($1, false, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         is_foster_available = EXCLUDED.is_foster_available,
         foster_pet_types = EXCLUDED.foster_pet_types,
         foster_max_days = EXCLUDED.foster_max_days,
         service_radius_km = EXCLUDED.service_radius_km,
         foster_sizes = EXCLUDED.foster_sizes,
         foster_capacity = EXCLUDED.foster_capacity,
         foster_special_needs = EXCLUDED.foster_special_needs,
         foster_offers = EXCLUDED.foster_offers,
         foster_notes = EXCLUDED.foster_notes,
         updated_at = now()`,
      [
        user.id,
        input.isFosterAvailable,
        JSON.stringify(input.fosterPetTypes),
        input.fosterMaxDays,
        input.serviceRadiusKm,
        JSON.stringify(input.fosterSizes),
        input.capacity,
        input.acceptsSpecialNeeds,
        JSON.stringify(input.offers),
        notes || null,
      ],
    );
    return {
      saved: true,
      slots: { capacity: input.capacity, occupied, free: freeSlots(input.capacity, occupied) },
    };
  });

  // Casas que aceitam esta espécie e porte e ainda têm vaga, com a distância em km inteiros.
  app.get('/posts/:id/foster-options', async (request) => {
    const viewer = request.user;
    if (!viewer) return { homes: [] };
    const id = postIdOf(request.params);
    const post = await loadPost(pool, id, viewer.id);
    if (!canUseHomes(viewer, post) || post.type === 'lost') return { homes: [] };
    const result = await pool.query<HomeRow>(
      `SELECT * FROM (
         SELECT u.id, u.name, u.handle, u.avatar_url, u.verified,
                (u.whatsapp_opt_in AND u.phone IS NOT NULL) AS has_whatsapp,
                v.foster_pet_types, v.foster_sizes, v.foster_max_days, v.foster_capacity,
                v.foster_special_needs, v.foster_offers, v.foster_notes,
                (SELECT count(*)::int FROM foster_stays s
                 WHERE s.foster_id = u.id AND s.status = 'approved') AS occupied,
                CASE WHEN u.base_location IS NULL THEN NULL
                     ELSE ST_Distance(u.base_location, p.location) END AS meters,
                v.service_radius_km,
                mine.id AS my_request_id, mine.status AS my_request_status
         FROM volunteer_profiles v
         JOIN users u ON u.id = v.user_id
         JOIN posts p ON p.id = $1
         LEFT JOIN LATERAL (
           SELECT s.id, s.status FROM foster_stays s
           WHERE s.foster_id = u.id AND s.post_id = p.id AND s.status IN ('requested', 'approved')
           LIMIT 1
         ) mine ON true
         WHERE v.is_foster_available = true
           AND v.foster_pet_types ? $2
           AND v.foster_sizes ? $3
           AND u.deleted_at IS NULL AND u.suspended = false
           AND u.id <> $4
           AND NOT EXISTS (
             SELECT 1 FROM blocks b
             WHERE (b.blocker_id = u.id AND b.blocked_id = $4) OR (b.blocker_id = $4 AND b.blocked_id = u.id)
           )
       ) homes
       WHERE (meters IS NULL OR meters <= service_radius_km * 1000)
         AND (occupied < foster_capacity OR my_request_id IS NOT NULL)
       ORDER BY meters ASC NULLS LAST, verified DESC, name ASC
       LIMIT ${HOMES_LIMIT}`,
      [id, post.species, post.size, viewer.id],
    );
    return {
      // O animal já está numa Casa Amiga aceita: o app mostra isso em vez de mais pedidos.
      needsHome: needsHomeStatuses.has(post.status),
      homes: result.rows.map((home) => ({
        id: home.id,
        name: home.name,
        handle: home.handle,
        avatarUrl: home.avatar_url ? publicMediaUrl(env, home.avatar_url, 'thumb') : null,
        verified: home.verified,
        hasWhatsApp: home.has_whatsapp,
        petTypes: home.foster_pet_types,
        sizes: home.foster_sizes,
        maxDays: home.foster_max_days,
        capacity: home.foster_capacity,
        freeSlots: freeSlots(home.foster_capacity, home.occupied),
        acceptsSpecialNeeds: home.foster_special_needs,
        offers: home.foster_offers,
        notes: home.foster_notes,
        distanceKm: home.meters === null ? null : fosterDistanceKm(home.meters),
        myRequest: home.my_request_id
          ? { id: home.my_request_id, status: home.my_request_status }
          : null,
      })),
    };
  });

  app.post('/posts/:id/foster-requests', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const id = postIdOf(request.params);
    const input = parse(fosterRequestSchema, request.body);
    const post = await loadPost(pool, id, user.id);
    if (!canUseHomes(user, post)) {
      throw new HttpError(403, 'Diga "vou ajudar" no resgate para pedir uma Casa Amiga.');
    }
    if (post.type === 'lost') {
      throw new HttpError(400, 'Animal perdido tem família. Fale com o tutor pelo post.');
    }
    if (!needsHomeStatuses.has(post.status)) {
      throw new HttpError(409, 'Esse animal já tem onde ficar.');
    }
    if (input.fosterId === user.id) throw new HttpError(400, 'Essa Casa Amiga é a sua.');
    const message = stripControls(input.message).trim();
    if (looksLikeAnimalSale(message)) throw new HttpError(400, 'Não é permitido vender animais.');
    const home = await pool.query<ProfileRow & { blocked: boolean }>(
      `SELECT v.is_foster_available, v.foster_pet_types, v.foster_sizes, v.foster_max_days,
              v.foster_capacity, v.foster_special_needs, v.foster_offers, v.foster_notes,
              v.service_radius_km,
              EXISTS (
                SELECT 1 FROM blocks b
                WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id)
              ) AS blocked
       FROM volunteer_profiles v JOIN users u ON u.id = v.user_id
       WHERE v.user_id = $1 AND u.deleted_at IS NULL AND u.suspended = false`,
      [input.fosterId, user.id],
    );
    const found = home.rows[0];
    if (!found || found.blocked || !found.is_foster_available) {
      throw new HttpError(404, 'Essa Casa Amiga não está mais disponível.');
    }
    if (!found.foster_pet_types.includes(post.species) || !found.foster_sizes.includes(post.size)) {
      throw new HttpError(409, 'Essa Casa Amiga não acolhe esse tipo ou porte de animal.');
    }
    if ((await occupiedSlots(pool, input.fosterId)) >= found.foster_capacity) {
      throw new HttpError(409, 'Essa Casa Amiga está sem vaga agora.');
    }
    let stayId: string | undefined;
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO foster_stays (foster_id, post_id, animal_id, requested_by, message, expected_days, special_care)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          input.fosterId,
          id,
          post.animal_id,
          user.id,
          message,
          input.expectedDays ?? null,
          input.specialCare ?? false,
        ],
      );
      stayId = created.rows[0]?.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'Você já pediu para essa Casa Amiga. Aguarde a resposta.');
      }
      throw error;
    }
    await notifyPeople(pool, env, [input.fosterId], 'foster_request', {
      title: 'Pedido de lar temporário',
      body: `${firstName(user.name)} pediu para você acolher um animal${input.expectedDays ? ` por ${input.expectedDays} dias` : ''}. Veja e responda na sua Casa Amiga.`,
      route: '/casa-amiga',
    }).catch(bestEffort(request, 'notify:foster-request'));
    return reply.code(201).send({ id: stayId, status: 'requested' });
  });

  app.post('/foster-stays/:id/:action', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = stayParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse pedido não existe mais.');
    const { id, action } = parsed.data;
    const body = parse(
      z.object({ note: z.string().trim().max(300).optional() }).strict(),
      request.body ?? {},
    );
    const note = body.note ? stripControls(body.note).trim() : '';

    const client = await pool.connect();
    let outcome: {
      next: FosterStayStatus;
      stay: { foster_id: string; requested_by: string | null; post_id: string; animal_id: string };
      statusMoved: boolean;
      fosterName: string;
      animalLabel: string;
    };
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        status: FosterStayStatus;
        foster_id: string;
        requested_by: string | null;
        post_id: string;
        animal_id: string;
        decided_at: Date | null;
        author_id: string;
        foster_name: string;
        animal_name: string | null;
        species: string;
      }>(
        `SELECT s.status, s.foster_id, s.requested_by, s.post_id, s.animal_id, s.decided_at,
                p.author_id, f.name AS foster_name, a.name AS animal_name, a.species
         FROM foster_stays s
         JOIN posts p ON p.id = s.post_id
         JOIN animals a ON a.id = p.animal_id
         JOIN users f ON f.id = s.foster_id
         WHERE s.id = $1 FOR UPDATE OF s`,
        [id],
      );
      const stay = found.rows[0];
      if (!stay) throw new HttpError(404, 'Esse pedido não existe mais.');
      const actor =
        stay.foster_id === user.id
          ? 'foster'
          : stay.requested_by === user.id || stay.author_id === user.id
            ? 'requester'
            : isOperator(user.role)
              ? 'team'
              : null;
      if (!actor) throw new HttpError(404, 'Esse pedido não existe mais.');
      const next = fosterStayTransition(stay.status, action, actor);
      if (!next) throw new HttpError(409, 'Esse pedido já mudou. Atualize a tela.');

      let statusMoved = false;
      if (next === 'approved') {
        // Trava a Casa Amiga: dois aceites ao mesmo tempo não passam da capacidade.
        const profile = await client.query<{
          foster_capacity: number;
          is_foster_available: boolean;
        }>(
          `SELECT foster_capacity, is_foster_available FROM volunteer_profiles
           WHERE user_id = $1 FOR UPDATE`,
          [stay.foster_id],
        );
        const capacity = profile.rows[0]?.foster_capacity ?? 0;
        if ((await occupiedSlots(client, stay.foster_id)) >= capacity) {
          throw new HttpError(
            409,
            'Sua Casa Amiga está sem vaga. Encerre um acolhimento ou aumente a capacidade.',
          );
        }
        const animalId = (await resolveAnimal(client, stay.animal_id)) ?? stay.animal_id;
        const elsewhere = await client.query(
          `SELECT 1 FROM foster_stays WHERE animal_id = $1 AND status = 'approved' AND id <> $2`,
          [animalId, id],
        );
        if ((elsewhere.rowCount ?? 0) > 0) {
          throw new HttpError(409, 'Esse animal já está em outra Casa Amiga.');
        }
        await client.query(
          `UPDATE foster_stays SET status = 'approved', decided_at = now(), response_note = $2,
             animal_id = $3
           WHERE id = $1`,
          [id, note || null, animalId],
        );
        const requester = stay.requested_by
          ? await client.query<{ id: string; role: string }>(
              `SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL`,
              [stay.requested_by],
            )
          : null;
        statusMoved = await moveToFosterHome(
          client,
          stay.post_id,
          requester?.rows[0] ?? { id: stay.author_id, role: 'user' },
          stay.foster_id,
        );
      } else if (next === 'declined') {
        await client.query(
          `UPDATE foster_stays SET status = 'declined', decided_at = now(), response_note = $2,
             closed_by = $3
           WHERE id = $1`,
          [id, note || null, user.id],
        );
      } else {
        const wasApproved = stay.status === 'approved';
        await client.query(
          `UPDATE foster_stays SET status = $2, ended_at = now(), closed_by = $3,
             response_note = COALESCE($4, response_note)
           WHERE id = $1`,
          [id, next, user.id, note || null],
        );
        if (wasApproved) {
          const animalId = (await resolveAnimal(client, stay.animal_id)) ?? stay.animal_id;
          await client.query(
            `UPDATE animal_custody SET ended_at = now()
             WHERE animal_id = $1 AND kind = 'foster' AND user_id = $2 AND ended_at IS NULL`,
            [animalId, stay.foster_id],
          );
          if (next === 'ended' && stay.decided_at) {
            await awardFosterXp(client, stay.foster_id, id, stayDays(stay.decided_at, new Date()));
          }
        }
      }
      await client.query('COMMIT');
      outcome = {
        next,
        stay,
        statusMoved,
        fosterName: stay.foster_name,
        animalLabel: animalWord(stay.animal_name, stay.species),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const { next, stay } = outcome;
    const other = user.id === stay.foster_id ? stay.requested_by : stay.foster_id;
    const messages: Record<FosterStayStatus, { title: string; body: string } | null> = {
      requested: null,
      approved: {
        title: 'Casa Amiga aceitou',
        body: `${firstName(outcome.fosterName)} aceitou acolher ${outcome.animalLabel}. Combinem a entrega pelo app ou WhatsApp.`,
      },
      declined: {
        title: 'Casa Amiga sem condições agora',
        body: `${firstName(outcome.fosterName)} não pode acolher desta vez. Tente outra Casa Amiga no post.`,
      },
      cancelled: {
        title: 'Acolhimento cancelado',
        body: `O acolhimento de ${outcome.animalLabel} foi cancelado.`,
      },
      ended: {
        title: 'Acolhimento encerrado',
        body: `O acolhimento de ${outcome.animalLabel} terminou. Se ele mudou de lugar, atualize o status do post.`,
      },
    };
    const text = messages[next];
    if (other && text) {
      await notifyPeople(pool, env, [other], 'foster_stay', {
        ...text,
        postId: stay.post_id,
        route: user.id === stay.foster_id ? `/post/${stay.post_id}` : '/casa-amiga',
      }).catch(bestEffort(request, 'notify:foster-stay'));
    }
    if (outcome.statusMoved) {
      await notifyStatusChange(pool, env, stay.post_id, 'fostered').catch(
        bestEffort(request, 'notify:status'),
      );
    }
    return { status: next, postStatusChanged: outcome.statusMoved };
  });

  // Depois do aceite, as duas pontas podem se falar no WhatsApp, se cada uma liberou o número.
  app.post('/foster-stays/:id/contact', contactLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse acolhimento não existe mais.');
    const found = await pool.query<{ foster_id: string; requested_by: string | null }>(
      `SELECT foster_id, requested_by FROM foster_stays WHERE id = $1 AND status = 'approved'`,
      [parsed.data.id],
    );
    const stay = found.rows[0];
    if (!stay || (stay.foster_id !== user.id && stay.requested_by !== user.id)) {
      throw new HttpError(404, 'Esse acolhimento não existe mais.');
    }
    const otherId = stay.foster_id === user.id ? stay.requested_by : stay.foster_id;
    const other = otherId
      ? await pool.query<{ phone: string | null; whatsapp_opt_in: boolean }>(
          `SELECT phone, whatsapp_opt_in FROM users WHERE id = $1 AND deleted_at IS NULL`,
          [otherId],
        )
      : null;
    const row = other?.rows[0];
    if (!row?.phone || !row.whatsapp_opt_in) {
      throw new HttpError(
        404,
        'Essa pessoa ainda não liberou o WhatsApp. Combinem pelos comentários do post.',
      );
    }
    return { phone: row.phone };
  });
}
