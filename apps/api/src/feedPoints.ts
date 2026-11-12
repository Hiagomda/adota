import type { S3Client } from '@aws-sdk/client-s3';
import {
  FEED_POINT_GONE_LIMIT,
  MAX_PENDING_FEED_POINTS,
  feedPointMapQuerySchema,
  feedPointReportSchema,
  feedPointRequestSchema,
  looksLikeAnimalSale,
  type FeedPointKind,
  type FeedPointRelation,
  type FeedPointRequestInput,
  type FeedPointStatus,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl, verifyUploadedImages } from './media.js';
import { notifyPeople } from './notify.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

const MAP_LIMIT = 300;
const NOT_FOUND = 'Esse ponto não existe mais.';
/** Quem cuida recebe no máximo um aviso de "está vazio" nesse intervalo. */
const OWNER_WARN_HOURS = 12;

export const feedPointKindLabel: Record<FeedPointKind, string> = {
  food: 'Ração',
  water: 'Água',
  both: 'Ração e água',
};

export interface FeedPointRow {
  id: string;
  user_id: string;
  kind: FeedPointKind;
  relation: FeedPointRelation;
  address_text: string;
  note: string | null;
  latitude: number;
  longitude: number;
  photo_key: string | null;
  status: FeedPointStatus;
  review_note: string | null;
  last_refilled_at: Date | null;
  last_empty_at: Date | null;
  last_checked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const feedPointColumns = `f.id, f.user_id, f.kind, f.relation, f.address_text, f.note,
  ST_Y(f.location::geometry) AS latitude, ST_X(f.location::geometry) AS longitude, f.photo_key,
  f.status, f.review_note, f.last_refilled_at, f.last_empty_at, f.last_checked_at, f.created_at,
  f.updated_at`;

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/**
 * O que todo mundo vê de um ponto no mapa. Sem nome de quem cadastrou: o pote pode estar na
 * porta de casa, e o mapa não precisa dizer de quem é a casa.
 */
export function publicFeedPoint(env: Env, row: FeedPointRow) {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: feedPointKindLabel[row.kind] ?? row.kind,
    relation: row.relation,
    addressText: row.address_text,
    note: row.note,
    location: { latitude: row.latitude, longitude: row.longitude },
    photo: row.photo_key
      ? {
          url: publicMediaUrl(env, row.photo_key, 'full'),
          thumbUrl: publicMediaUrl(env, row.photo_key, 'thumb'),
        }
      : null,
    lastRefilledAt: iso(row.last_refilled_at),
    lastEmptyAt: iso(row.last_empty_at),
    lastCheckedAt: iso(row.last_checked_at),
    createdAt: row.created_at.toISOString(),
  };
}

/** O que quem cadastrou vê: o público mais o andamento da revisão. */
function ownFeedPoint(env: Env, row: FeedPointRow) {
  return {
    ...publicFeedPoint(env, row),
    status: row.status,
    reviewNote: row.review_note,
    visible: row.status === 'approved',
    mine: true,
    updatedAt: row.updated_at.toISOString(),
  };
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function pointId(params: unknown): string {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, NOT_FOUND);
  return parsed.data.id;
}

/** Textos limpos para gravar. Ponto solidário também não vende animal. */
function cleanInput(input: FeedPointRequestInput) {
  const note = input.note ? stripControls(input.note).trim() || null : null;
  const addressText = stripControls(input.addressText).trim();
  if ([note, addressText].some((text) => text && looksLikeAnimalSale(text))) {
    throw new HttpError(400, 'Não é permitido vender animais pelo Égua, adota!.');
  }
  return { note, addressText };
}

const visible = `f.status = 'approved'`;
const liveOwner = `JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL AND u.suspended = false`;

export function registerFeedPointRoutes(
  app: FastifyInstance,
  deps: {
    env: Env;
    pool: Pool;
    storage: S3Client;
    writeLimit: RouteLimit;
    strictLimit: RouteLimit;
  },
): void {
  const { env, pool, storage, writeLimit, strictLimit } = deps;

  // Pontos na área visível do mapa.
  app.get('/feed-points', async (request) => {
    const query = parse(feedPointMapQuerySchema, request.query ?? {});
    const result = await pool.query<FeedPointRow>(
      `SELECT ${feedPointColumns}
       FROM feed_points f ${liveOwner}
       WHERE ${visible}
         AND ST_Intersects(f.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography)
         AND ($5::text IS NULL OR f.kind = $5 OR f.kind = 'both')
       ORDER BY f.created_at ASC
       LIMIT ${MAP_LIMIT}`,
      [query.west, query.south, query.east, query.north, query.kind ?? null],
    );
    return { points: result.rows.map((row) => publicFeedPoint(env, row)) };
  });

  app.get('/feed-points/mine', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query<FeedPointRow>(
      `SELECT ${feedPointColumns} FROM feed_points f
       WHERE f.user_id = $1 AND f.status <> 'removed'
       ORDER BY f.created_at DESC`,
      [user.id],
    );
    return { points: result.rows.map((row) => ownFeedPoint(env, row)) };
  });

  app.get('/feed-points/:id', async (request) => {
    const id = pointId(request.params);
    const result = await pool.query<FeedPointRow>(
      `SELECT ${feedPointColumns} FROM feed_points f
       JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
       WHERE f.id = $1`,
      [id],
    );
    const row = result.rows[0];
    const own = row && request.user && row.user_id === request.user.id;
    if (!row || (!own && row.status !== 'approved')) throw new HttpError(404, NOT_FOUND);
    return { point: own ? ownFeedPoint(env, row) : publicFeedPoint(env, row) };
  });

  app.post('/feed-points', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const input = parse(feedPointRequestSchema, request.body);
    const fields = cleanInput(input);
    if (input.photoKey) await verifyUploadedImages(env, storage, user.id, [input.photoKey]);
    const pending = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM feed_points WHERE user_id = $1 AND status = 'pending'`,
      [user.id],
    );
    if (!user.verified && (pending.rows[0]?.count ?? 0) >= MAX_PENDING_FEED_POINTS) {
      throw new HttpError(
        429,
        'Você já tem pontos esperando a equipe. Assim que eles forem vistos, mande outro.',
      );
    }
    // Perfil verificado (ONG, protetor conhecido) já entra no mapa; o resto a equipe confere.
    const status: FeedPointStatus = user.verified ? 'approved' : 'pending';
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO feed_points (
         user_id, kind, relation, address_text, note, location, photo_key, status,
         last_checked_at
       ) VALUES (
         $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, $9, now()
       )
       RETURNING id`,
      [
        user.id,
        input.kind,
        input.relation,
        fields.addressText,
        fields.note,
        input.longitude,
        input.latitude,
        input.photoKey ?? null,
        status,
      ],
    );
    return reply.code(201).send({ id: inserted.rows[0]?.id, status });
  });

  // Editar volta para a fila (menos perfil verificado): o mapa mostra o que a equipe viu.
  app.patch('/feed-points/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = pointId(request.params);
    const input = parse(feedPointRequestSchema, request.body);
    const fields = cleanInput(input);
    if (input.photoKey) await verifyUploadedImages(env, storage, user.id, [input.photoKey]);
    const updated = await pool.query<{ status: FeedPointStatus }>(
      `UPDATE feed_points SET
         kind = $3, relation = $4, address_text = $5, note = $6,
         location = ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
         photo_key = CASE WHEN $10::boolean THEN NULL ELSE COALESCE($9::text, photo_key) END,
         status = CASE WHEN $11::boolean AND status = 'approved' THEN 'approved' ELSE 'pending' END,
         review_note = NULL, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status <> 'removed'
       RETURNING status`,
      [
        id,
        user.id,
        input.kind,
        input.relation,
        fields.addressText,
        fields.note,
        input.longitude,
        input.latitude,
        input.photoKey ?? null,
        input.removePhoto === true && !input.photoKey,
        user.verified,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new HttpError(404, NOT_FOUND);
    return { status: row.status };
  });

  app.delete('/feed-points/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = pointId(request.params);
    const removed = await pool.query(`DELETE FROM feed_points WHERE id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);
    if (removed.rowCount === 0) throw new HttpError(404, NOT_FOUND);
    return { removed: true };
  });

  // Quem passa conta como está o ponto. Precisa de conta, para três toques do mesmo celular não
  // tirarem um ponto do mapa.
  app.post('/feed-points/:id/report', writeLimit, async (request) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const id = pointId(request.params);
    const { report } = parse(feedPointReportSchema, request.body);
    const found = await pool.query<{
      user_id: string;
      relation: FeedPointRelation;
      address_text: string;
      owner_warned_at: Date | null;
    }>(
      `SELECT f.user_id, f.relation, f.address_text, f.owner_warned_at
       FROM feed_points f WHERE f.id = $1 AND ${visible}`,
      [id],
    );
    const point = found.rows[0];
    if (!point) throw new HttpError(404, NOT_FOUND);
    await pool.query(
      `INSERT INTO feed_point_reports (feed_point_id, user_id, report) VALUES ($1, $2, $3)
       ON CONFLICT (feed_point_id, user_id, report) DO UPDATE SET created_at = now()`,
      [id, user.id, report],
    );
    if (report === 'gone') {
      // Quem cadastrou dizendo que sumiu tira na hora; de outras pessoas, precisa de três.
      const gone = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM feed_point_reports
         WHERE feed_point_id = $1 AND report = 'gone' AND created_at > now() - interval '30 days'`,
        [id],
      );
      const own = point.user_id === user.id;
      if (own || (gone.rows[0]?.count ?? 0) >= FEED_POINT_GONE_LIMIT) {
        await pool.query(
          `UPDATE feed_points SET status = $2, review_note = $3, updated_at = now()
           WHERE id = $1 AND status = 'approved'`,
          [
            id,
            own ? 'removed' : 'pending',
            own
              ? 'Você tirou o ponto do mapa.'
              : 'Algumas pessoas disseram que o ponto não existe mais. A equipe vai conferir.',
          ],
        );
        return { report, hidden: true };
      }
      return { report, hidden: false };
    }
    const column = {
      refilled: 'last_refilled_at',
      empty: 'last_empty_at',
      checked: 'last_checked_at',
    }[report];
    // Abastecer também confirma que o ponto está lá.
    await pool.query(
      `UPDATE feed_points SET ${column} = now()${report === 'refilled' ? ', last_checked_at = now()' : ''}
       WHERE id = $1`,
      [id],
    );
    const warn =
      report === 'empty' &&
      point.relation === 'mine' &&
      point.user_id !== user.id &&
      (!point.owner_warned_at ||
        Date.now() - point.owner_warned_at.getTime() > OWNER_WARN_HOURS * 60 * 60 * 1000);
    if (warn) {
      await pool.query(`UPDATE feed_points SET owner_warned_at = now() WHERE id = $1`, [id]);
      await notifyPeople(pool, env, [point.user_id], 'feed_point_empty', {
        title: 'Seu ponto solidário está vazio',
        body: `Alguém passou em ${point.address_text} e disse que acabou. Dá para abastecer?`,
        route: `/ponto/${id}`,
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:feed-point-empty' }, 'best-effort');
      });
    }
    return { report, hidden: false };
  });
}
