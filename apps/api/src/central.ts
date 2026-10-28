import {
  centralQuerySchema,
  centralScore,
  helpOfferDecisionSchema,
  helpOfferSchema,
  nextOfferStatus,
  publicDistanceKm,
  type CentralStatus,
  type HelpOfferKind,
  type HelpOfferStatus,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyPeople } from './notify.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/** Casos lidos do banco antes de ordenar pela urgência. Belém cabe folgado nisso. */
const CANDIDATE_LIMIT = 300;
/** Um resgatado sai da central depois disso sem lar temporário; ele segue no feed e no passaporte. */
const RESCUED_WINDOW_DAYS = 14;
const VOLUNTEERS_PER_CASE = 4;

const centralStatuses: readonly CentralStatus[] = ['open', 'on_the_way', 'not_found', 'rescued'];

const offerKindTitle: Record<HelpOfferKind, string> = {
  foster: 'lar temporário',
  food: 'ração',
  vet: 'veterinário',
  supplies: 'materiais',
  other: 'ajuda',
};

const idParams = z.object({ id: z.string().uuid() });
const decisionParams = z.object({ id: z.string().uuid(), decision: helpOfferDecisionSchema });

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Alguém';
}

interface CaseRow {
  id: string;
  urgency: 'low' | 'medium' | 'high';
  status: CentralStatus;
  created_at: Date;
  approx_label: string;
  author_id: string;
  animal_id: string;
  species: string;
  size: string;
  animal_name: string | null;
  approx_lat: number;
  approx_lng: number;
  distance_m: number | null;
  going: number;
  foster_stay: 'requested' | 'approved' | null;
  photo: string | null;
  last_activity_at: Date;
}

interface PersonRow {
  post_id: string;
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  role: 'going' | HelpOfferKind;
  status: HelpOfferStatus | null;
  at: Date;
}

/** Os casos em andamento, ordenados por urgência, com quem está ajudando e o que falta. */
export async function loadCentral(
  pool: Pool,
  env: Env,
  rawQuery: unknown,
  viewer: SessionUser | null,
) {
  const query = parse(centralQuerySchema, rawQuery);
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = [
    "p.type = 'rescue_alert'",
    'p.parent_post_id IS NULL',
    'p.hidden = false',
    "p.review_status = 'published'",
    'u.deleted_at IS NULL',
    'u.suspended = false',
    `(p.status IN ('open', 'on_the_way', 'not_found')
      OR (p.status = 'rescued' AND p.created_at > now() - interval '${RESCUED_WINDOW_DAYS} days'))`,
  ];
  if (viewer) {
    const viewerParam = add(viewer.id);
    where.push(`NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = p.author_id)
         OR (b.blocker_id = p.author_id AND b.blocked_id = ${viewerParam})
    )`);
  }
  if (query.species) where.push(`a.species = ${add(query.species)}`);
  if (query.status) where.push(`p.status = ${add(query.status)}`);
  let distance = 'NULL::float8';
  if (query.latitude !== undefined && query.longitude !== undefined) {
    const point = `ST_SetSRID(ST_MakePoint(${add(query.longitude)}, ${add(query.latitude)}), 4326)::geography`;
    distance = `ST_Distance(p.location, ${point})`;
    if (query.radiusKm !== undefined) {
      where.push(`ST_DWithin(p.location, ${point}, ${add(query.radiusKm * 1000)})`);
    }
  }
  const result = await pool.query<CaseRow>(
    `SELECT p.id, p.urgency, p.status, p.created_at, p.approx_label, p.author_id,
            a.id AS animal_id, a.species, a.size, a.name AS animal_name,
            ST_Y(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lat,
            ST_X(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lng,
            ${distance} AS distance_m,
            (SELECT count(*)::int FROM responses r WHERE r.post_id = p.id AND r.kind = 'will_help') AS going,
            -- Pedido de acolhimento numa Casa Amiga: aprovado vale mais que só pedido.
            (SELECT CASE WHEN bool_or(fs.status = 'approved') THEN 'approved' ELSE 'requested' END
             FROM foster_stays fs
             WHERE fs.post_id = p.id AND fs.status IN ('requested', 'approved')
             HAVING count(*) > 0) AS foster_stay,
            (SELECT m.url FROM post_media m WHERE m.post_id = p.id ORDER BY m.position LIMIT 1) AS photo,
            GREATEST(
              p.created_at,
              (SELECT max(c.created_at) FROM posts c WHERE c.parent_post_id = p.id AND c.hidden = false),
              (SELECT max(r.created_at) FROM responses r WHERE r.post_id = p.id),
              (SELECT max(o.updated_at) FROM rescue_help_offers o WHERE o.post_id = p.id),
              (SELECT max(s.created_at) FROM sightings s WHERE s.post_id = p.id),
              (SELECT max(COALESCE(fs.decided_at, fs.created_at)) FROM foster_stays fs WHERE fs.post_id = p.id)
            ) AS last_activity_at
     FROM posts p
     JOIN users u ON u.id = p.author_id
     JOIN animals a ON a.id = p.animal_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC
     LIMIT ${CANDIDATE_LIMIT}`,
    params,
  );
  const rows = result.rows;
  const ids = rows.map((row) => row.id);
  const people =
    ids.length === 0
      ? []
      : (
          await pool.query<PersonRow>(
            `SELECT r.post_id, u.id AS user_id, u.name, u.handle, u.avatar_url,
                    'going' AS role, NULL AS status, r.created_at AS at
             FROM responses r JOIN users u ON u.id = r.user_id
             WHERE r.post_id = ANY($1::uuid[]) AND r.kind = 'will_help' AND u.deleted_at IS NULL
             UNION ALL
             SELECT o.post_id, u.id, u.name, u.handle, u.avatar_url, o.kind, o.status, o.created_at
             FROM rescue_help_offers o JOIN users u ON u.id = o.user_id
             WHERE o.post_id = ANY($1::uuid[]) AND o.status IN ('offered', 'accepted')
               AND u.deleted_at IS NULL
             ORDER BY at`,
            [ids],
          )
        ).rows;

  const now = Date.now();
  const volunteers = new Set<string>();
  let withoutHelpCount = 0;
  const cases = rows.map((row) => {
    const mine = people.filter((person) => person.post_id === row.id);
    const offers = mine.filter((person) => person.role !== 'going');
    const offerCounts: Record<HelpOfferKind, number> = {
      foster: 0,
      food: 0,
      vet: 0,
      supplies: 0,
      other: 0,
    };
    for (const offer of offers) offerCounts[offer.role as HelpOfferKind] += 1;
    const helperIds = new Set(mine.map((person) => person.user_id));
    for (const id of helperIds) volunteers.add(id);
    const withoutHelp = helperIds.size === 0 && row.foster_stay === null;
    if (withoutHelp) withoutHelpCount += 1;
    const distanceKm = row.distance_m === null ? null : publicDistanceKm(row.distance_m);
    const { score, reasons } = centralScore({
      urgency: row.urgency,
      status: row.status,
      ageHours: (now - row.created_at.getTime()) / 3_600_000,
      goingCount: row.going,
      offerCount: offers.length,
      hasFoster: offerCounts.foster > 0 || row.foster_stay !== null,
      distanceKm,
    });
    // Rosto e primeiro nome de quem ajuda: o bastante para ver que tem gente, sem expor mais.
    const seen = new Set<string>();
    const faces = [];
    for (const person of mine) {
      if (seen.has(person.user_id) || faces.length >= VOLUNTEERS_PER_CASE) continue;
      seen.add(person.user_id);
      faces.push({
        name: firstName(person.name),
        handle: person.handle,
        avatarUrl: person.avatar_url,
      });
    }
    return {
      id: row.id,
      urgency: row.urgency,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      lastActivityAt: row.last_activity_at.toISOString(),
      approxLabel: row.approx_label,
      // Sempre o ponto aproximado: o exato continua só para quem vai ajudar, no post.
      location: { latitude: row.approx_lat, longitude: row.approx_lng, exact: false },
      distanceKm,
      animal: {
        id: row.animal_id,
        species: row.species,
        size: row.size,
        name: row.animal_name,
        thumbUrl: row.photo ? publicMediaUrl(env, row.photo, 'thumb') : null,
      },
      goingCount: row.going,
      offerCounts,
      helperCount: helperIds.size,
      // Casa Amiga pedida ou aceita pelas Casas Amigas (APKs antigos ignoram).
      fosterStay: row.foster_stay,
      volunteers: faces,
      withoutHelp,
      score,
      reasons,
      viewer: {
        isAuthor: viewer?.id === row.author_id,
        willHelp: mine.some((person) => person.role === 'going' && person.user_id === viewer?.id),
        offers: offers
          .filter((offer) => offer.user_id === viewer?.id)
          .map((offer) => offer.role as HelpOfferKind),
      },
    };
  });
  const sorted = cases
    .filter((item) => !query.withoutHelp || item.withoutHelp)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, query.limit);
  return {
    serverTime: new Date(now).toISOString(),
    // O app pergunta de novo nesse intervalo enquanto a central está aberta.
    refreshSeconds: 20,
    summary: {
      activeCases: cases.length,
      withoutHelp: withoutHelpCount,
      volunteers: volunteers.size,
      urgent: cases.filter((item) => item.urgency === 'high').length,
    },
    cases: sorted,
  };
}

interface PostForOffer {
  id: string;
  author_id: string;
  status: string;
  approx_label: string;
}

async function rescueForOffers(pool: Pool, postId: string): Promise<PostForOffer> {
  const found = await pool.query<PostForOffer>(
    `SELECT p.id, p.author_id, p.status, p.approx_label FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1 AND p.type = 'rescue_alert' AND p.parent_post_id IS NULL
       AND p.hidden = false AND p.review_status = 'published' AND u.deleted_at IS NULL`,
    [postId],
  );
  const post = found.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe.');
  return post;
}

interface OfferRow {
  id: string;
  post_id: string;
  user_id: string;
  kind: HelpOfferKind;
  note: string | null;
  status: HelpOfferStatus;
  created_at: Date;
  updated_at: Date;
  name: string;
  handle: string;
  avatar_url: string | null;
}

/**
 * Ofertas de um resgate. Quem publicou e a equipe veem todas, com o recado; quem ofereceu vê a
 * própria; os outros veem só o primeiro nome e o tipo, porque o recado pode ter dado pessoal.
 */
export async function listOffers(pool: Pool, postId: string, viewer: SessionUser | null) {
  const post = await rescueForOffers(pool, postId);
  const manager = viewer !== null && (viewer.id === post.author_id || isOperator(viewer.role));
  const found = await pool.query<OfferRow>(
    `SELECT o.id, o.post_id, o.user_id, o.kind, o.note, o.status, o.created_at, o.updated_at,
            u.name, u.handle, u.avatar_url
     FROM rescue_help_offers o JOIN users u ON u.id = o.user_id
     WHERE o.post_id = $1 AND u.deleted_at IS NULL
       AND (o.status IN ('offered', 'accepted') OR o.user_id = $2 OR $3::boolean)
     ORDER BY o.created_at`,
    [postId, viewer?.id ?? null, manager],
  );
  return {
    canDecide: manager,
    canOffer:
      viewer !== null &&
      viewer.id !== post.author_id &&
      centralStatuses.includes(post.status as CentralStatus),
    offers: found.rows.map((row) => {
      const mine = row.user_id === viewer?.id;
      const full = manager || mine;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        note: full ? row.note : null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        mine,
        person: {
          name: full ? row.name : firstName(row.name),
          handle: row.handle,
          avatarUrl: row.avatar_url,
        },
      };
    }),
  };
}

/**
 * Oferece ajuda num resgate. Repetir a mesma oferta (internet caiu, toque duplo) devolve a que
 * já existe em vez de criar outra; o índice único parcial garante isso mesmo com dois pedidos
 * ao mesmo tempo.
 */
export async function createOffer(
  pool: Pool,
  env: Env,
  postId: string,
  user: SessionUser,
  body: unknown,
): Promise<{ id: string; created: boolean }> {
  const input = parse(helpOfferSchema, body);
  const post = await rescueForOffers(pool, postId);
  if (post.author_id === user.id) {
    throw new HttpError(400, 'Você publicou esse resgate. As ofertas são de outras pessoas.');
  }
  if (!centralStatuses.includes(post.status as CentralStatus)) {
    throw new HttpError(400, 'Esse resgate já está resolvido e não recebe ofertas.');
  }
  const blocked = await pool.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [user.id, post.author_id],
  );
  if ((blocked.rowCount ?? 0) > 0) throw new HttpError(404, 'Esse resgate não existe.');
  const note = input.note ? stripControls(input.note).trim() || null : null;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO rescue_help_offers (post_id, user_id, kind, note)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, user_id, kind) WHERE status IN ('offered', 'accepted') DO NOTHING
     RETURNING id`,
    [postId, user.id, input.kind, note],
  );
  const id = inserted.rows[0]?.id;
  if (!id) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM rescue_help_offers
       WHERE post_id = $1 AND user_id = $2 AND kind = $3 AND status IN ('offered', 'accepted')`,
      [postId, user.id, input.kind],
    );
    const found = existing.rows[0]?.id;
    if (!found) throw new HttpError(409, 'Não consegui registrar a oferta. Tente de novo.');
    return { id: found, created: false };
  }
  await notifyPeople(pool, env, [post.author_id], 'help_offer', {
    title: `Ofereceram ${offerKindTitle[input.kind]}`,
    body: `${firstName(user.name)} pode ajudar com ${offerKindTitle[input.kind]} em ${post.approx_label}. Responda no resgate.`,
    postId,
    route: `/post/${postId}`,
  });
  return { id, created: true };
}

/** Aceitar ou recusar (quem publicou ou a equipe) e desistir (quem ofereceu). */
export async function decideOffer(
  pool: Pool,
  env: Env,
  offerId: string,
  decision: z.infer<typeof helpOfferDecisionSchema>,
  user: SessionUser,
): Promise<{ status: HelpOfferStatus }> {
  const client = await pool.connect();
  let notice: { to: string; title: string; body: string; postId: string } | null = null;
  let status: HelpOfferStatus;
  try {
    await client.query('BEGIN');
    // A linha travada impede que aceitar e desistir ao mesmo tempo deixem um estado misturado.
    const found = await client.query<{
      user_id: string;
      kind: HelpOfferKind;
      status: HelpOfferStatus;
      post_id: string;
      author_id: string;
      approx_label: string;
      name: string;
    }>(
      `SELECT o.user_id, o.kind, o.status, o.post_id, p.author_id, p.approx_label, u.name
       FROM rescue_help_offers o
       JOIN posts p ON p.id = o.post_id
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [offerId],
    );
    const offer = found.rows[0];
    if (!offer) throw new HttpError(404, 'Essa oferta não existe.');
    const manager = user.id === offer.author_id || isOperator(user.role);
    if (decision === 'withdraw' ? offer.user_id !== user.id : !manager) {
      throw new HttpError(403, 'Você não pode fazer isso.');
    }
    const next = nextOfferStatus(offer.status, decision);
    if (!next) {
      // Mesmo pedido repetido: responde como se tivesse dado certo, sem avisar de novo.
      const repeated =
        (decision === 'accept' && offer.status === 'accepted') ||
        (decision === 'decline' && offer.status === 'declined') ||
        (decision === 'withdraw' && offer.status === 'withdrawn');
      if (repeated) {
        await client.query('COMMIT');
        return { status: offer.status };
      }
      throw new HttpError(409, 'Essa oferta já foi respondida.');
    }
    await client.query(
      `UPDATE rescue_help_offers
       SET status = $2, updated_at = now(), decided_by = $3
       WHERE id = $1`,
      [offerId, next, user.id],
    );
    await client.query('COMMIT');
    status = next;
    const what = offerKindTitle[offer.kind];
    if (next === 'accepted') {
      notice = {
        to: offer.user_id,
        title: 'Sua oferta foi aceita',
        body: `Quem cuida do resgate em ${offer.approx_label} aceitou sua ajuda com ${what}. Combine os detalhes pelos comentários do resgate.`,
        postId: offer.post_id,
      };
    } else if (next === 'declined') {
      notice = {
        to: offer.user_id,
        title: 'Obrigado pela oferta',
        body: `O resgate em ${offer.approx_label} não precisa de ${what} agora. Veja outros casos na central.`,
        postId: offer.post_id,
      };
    } else if (offer.user_id !== offer.author_id) {
      notice = {
        to: offer.author_id,
        title: 'Uma oferta foi retirada',
        body: `${firstName(offer.name)} não vai mais poder ajudar com ${what} em ${offer.approx_label}.`,
        postId: offer.post_id,
      };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (notice) {
    await notifyPeople(pool, env, [notice.to], 'help_offer', {
      title: notice.title,
      body: notice.body,
      postId: notice.postId,
      route: notice.title === 'Obrigado pela oferta' ? '/central' : `/post/${notice.postId}`,
    });
  }
  return { status };
}

export function registerCentralRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; publishLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, publishLimit } = deps;

  app.get('/central', async (request) => loadCentral(pool, env, request.query, request.user));

  app.get('/posts/:id/help-offers', async (request) => {
    const { id } = parseParams(idParams, request.params, 'Esse resgate não existe.');
    return listOffers(pool, id, request.user);
  });

  app.post('/posts/:id/help-offers', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const { id } = parseParams(idParams, request.params, 'Esse resgate não existe.');
    const result = await createOffer(pool, env, id, user, request.body);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.post('/help-offers/:id/:decision', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const { id, decision } = parseParams(decisionParams, request.params, 'Essa oferta não existe.');
    return decideOffer(pool, env, id, decision, user);
  });
}

function parseParams<Schema extends z.ZodTypeAny>(
  schema: Schema,
  params: unknown,
  message: string,
): z.output<Schema> {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new HttpError(404, message);
  return parsed.data;
}
