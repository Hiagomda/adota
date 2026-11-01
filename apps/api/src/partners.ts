import {
  MAX_PENDING_PARTNERS,
  looksLikeAnimalSale,
  partnerMapQuerySchema,
  partnerPauseSchema,
  partnerRequestSchema,
  partnerTapSchema,
  partnerUpdateSchema,
  type PartnerKind,
  type PartnerRequestInput,
  type PartnerStatus,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import { HttpError } from './http.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

const MAP_LIMIT = 200;
const SPOTLIGHT_LIMIT = 3;
const STATS_DAYS = 30;
const NOT_FOUND = 'Esse parceiro não existe mais.';

export const partnerKindLabel: Record<PartnerKind, string> = {
  petshop: 'Petshop',
  vet: 'Veterinário',
  clinic_24h: 'Clínica 24h',
  feed_store: 'Ração e acessórios',
  grooming: 'Banho e tosa',
  other: 'Outro',
};

export interface PartnerRow {
  id: string;
  user_id: string;
  name: string;
  kind: PartnerKind;
  about: string | null;
  perk: string;
  hours: string | null;
  address_text: string;
  latitude: number;
  longitude: number;
  whatsapp: string;
  instagram: string | null;
  status: PartnerStatus;
  owner_paused: boolean;
  featured: boolean;
  review_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export const partnerColumns = `p.id, p.user_id, p.name, p.kind, p.about, p.perk, p.hours,
  p.address_text, ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude,
  p.whatsapp, p.instagram, p.status, p.owner_paused, p.featured, p.review_note, p.created_at,
  p.updated_at`;

/** O que todo mundo vê de um parceiro aprovado. */
export function publicPartner(row: PartnerRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    kindLabel: partnerKindLabel[row.kind] ?? row.kind,
    about: row.about,
    perk: row.perk,
    hours: row.hours,
    addressText: row.address_text,
    location: { latitude: row.latitude, longitude: row.longitude },
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    featured: row.featured,
  };
}

/** O que quem pediu vê do próprio cadastro: o público mais o andamento da revisão. */
function ownPartner(row: PartnerRow) {
  return {
    ...publicPartner(row),
    status: row.status,
    paused: row.owner_paused,
    reviewNote: row.review_note,
    visible: row.status === 'approved' && !row.owner_paused,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function partnerId(params: unknown): string {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, NOT_FOUND);
  return parsed.data.id;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return stripControls(value).trim() || null;
}

/** Textos limpos para gravar. Parceiro também não vende animal. */
function cleanInput(input: PartnerRequestInput) {
  const fields = {
    name: stripControls(input.name).trim(),
    about: clean(input.about),
    perk: stripControls(input.perk).trim(),
    hours: clean(input.hours),
    addressText: stripControls(input.addressText).trim(),
  };
  if ([fields.name, fields.about, fields.perk].some((text) => text && looksLikeAnimalSale(text))) {
    throw new HttpError(400, 'Não é permitido vender animais pelo Égua, adota!.');
  }
  return fields;
}

const visible = `p.status = 'approved' AND p.owner_paused = false`;

export function registerPartnerRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; writeLimit: RouteLimit; strictLimit: RouteLimit },
): void {
  const { pool, writeLimit, strictLimit } = deps;

  // Parceiros na área visível do mapa.
  app.get('/partners', async (request) => {
    const query = parse(partnerMapQuerySchema, request.query ?? {});
    const result = await pool.query<PartnerRow>(
      `SELECT ${partnerColumns}
       FROM partners p
       JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND u.suspended = false
       WHERE ${visible}
         AND ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography)
         AND ($5::text IS NULL OR p.kind = $5)
       ORDER BY p.featured DESC, p.created_at ASC
       LIMIT ${MAP_LIMIT}`,
      [query.west, query.south, query.east, query.north, query.kind ?? null],
    );
    return { partners: result.rows.map(publicPartner) };
  });

  // Cartões "Parceiro do bem" do feed: destaques escolhidos pela equipe, perto de quem vê.
  app.get('/partners/spotlight', async (request) => {
    const near = z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
      })
      .safeParse(request.query ?? {});
    const point = near.success
      ? `ST_SetSRID(ST_MakePoint(${near.data.longitude}, ${near.data.latitude}), 4326)::geography`
      : null;
    const result = await pool.query<PartnerRow>(
      `SELECT ${partnerColumns}
       FROM partners p
       JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL AND u.suspended = false
       WHERE ${visible} AND p.featured = true
       ORDER BY ${point ? `ST_Distance(p.location, ${point}) ASC,` : ''} random()
       LIMIT ${SPOTLIGHT_LIMIT}`,
    );
    return { partners: result.rows.map(publicPartner) };
  });

  app.get('/partners/mine', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query<
      PartnerRow & { views_30d: number; whatsapp_30d: number; route_30d: number }
    >(
      `SELECT ${partnerColumns},
              COALESCE(s.views, 0)::int AS views_30d,
              COALESCE(s.whatsapp_taps, 0)::int AS whatsapp_30d,
              COALESCE(s.route_taps, 0)::int AS route_30d
       FROM partners p
       LEFT JOIN LATERAL (
         SELECT sum(views) AS views, sum(whatsapp_taps) AS whatsapp_taps, sum(route_taps) AS route_taps
         FROM partner_daily_stats
         WHERE partner_id = p.id AND day > (now() AT TIME ZONE 'America/Belem')::date - ${STATS_DAYS}
       ) s ON true
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [user.id],
    );
    return {
      partners: result.rows.map((row) => ({
        ...ownPartner(row),
        stats: {
          days: STATS_DAYS,
          views: row.views_30d,
          whatsappTaps: row.whatsapp_30d,
          routeTaps: row.route_30d,
        },
      })),
    };
  });

  app.get('/partners/:id', async (request) => {
    const id = partnerId(request.params);
    const result = await pool.query<PartnerRow>(
      `SELECT ${partnerColumns} FROM partners p
       JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
       WHERE p.id = $1`,
      [id],
    );
    const row = result.rows[0];
    const viewer = request.user;
    const own = row && viewer && row.user_id === viewer.id;
    if (!row || (!own && (row.status !== 'approved' || row.owner_paused))) {
      throw new HttpError(404, NOT_FOUND);
    }
    return { partner: own ? ownPartner(row) : publicPartner(row) };
  });

  app.post('/partners', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const input = parse(partnerRequestSchema, request.body);
    const fields = cleanInput(input);
    const pending = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM partners WHERE user_id = $1 AND status = 'pending'`,
      [user.id],
    );
    if ((pending.rows[0]?.count ?? 0) >= MAX_PENDING_PARTNERS) {
      throw new HttpError(
        429,
        'Você já tem pedidos esperando a equipe. Assim que eles forem vistos, mande outro.',
      );
    }
    const inserted = await pool.query<PartnerRow>(
      `INSERT INTO partners (
         user_id, name, kind, about, perk, hours, address_text, location, whatsapp, instagram
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10, $11
       )
       RETURNING id`,
      [
        user.id,
        fields.name,
        input.kind,
        fields.about,
        fields.perk,
        fields.hours,
        fields.addressText,
        input.longitude,
        input.latitude,
        input.whatsapp,
        input.instagram || null,
      ],
    );
    return reply.code(201).send({ id: inserted.rows[0]?.id, status: 'pending' });
  });

  // Editar volta para a fila: o que aparece no mapa é sempre o que a equipe viu.
  app.patch('/partners/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = partnerId(request.params);
    const input = parse(partnerUpdateSchema, request.body);
    const fields = cleanInput(input);
    const updated = await pool.query<{ status: string }>(
      `UPDATE partners SET
         name = $3, kind = $4, about = $5, perk = $6, hours = $7, address_text = $8,
         location = ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
         whatsapp = $11, instagram = $12,
         status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'pending' END,
         review_note = NULL, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING status`,
      [
        id,
        user.id,
        fields.name,
        input.kind,
        fields.about,
        fields.perk,
        fields.hours,
        fields.addressText,
        input.longitude,
        input.latitude,
        input.whatsapp,
        input.instagram || null,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new HttpError(404, NOT_FOUND);
    return { status: row.status };
  });

  app.post('/partners/:id/pause', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = partnerId(request.params);
    const { paused } = parse(partnerPauseSchema, request.body);
    const updated = await pool.query(
      `UPDATE partners SET owner_paused = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
      [id, user.id, paused],
    );
    if (updated.rowCount === 0) throw new HttpError(404, NOT_FOUND);
    return { paused };
  });

  app.delete('/partners/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = partnerId(request.params);
    const removed = await pool.query(`DELETE FROM partners WHERE id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);
    if (removed.rowCount === 0) throw new HttpError(404, NOT_FOUND);
    return { removed: true };
  });

  // Contagem anônima por dia. O próprio parceiro tocando no cartão não conta.
  app.post('/partners/:id/tap', writeLimit, async (request) => {
    const id = partnerId(request.params);
    const { kind } = parse(partnerTapSchema, request.body);
    const column = { view: 'views', whatsapp: 'whatsapp_taps', route: 'route_taps' }[kind];
    await pool.query(
      `INSERT INTO partner_daily_stats (partner_id, day, ${column})
       SELECT p.id, (now() AT TIME ZONE 'America/Belem')::date, 1
       FROM partners p
       WHERE p.id = $1 AND ${visible} AND ($2::uuid IS NULL OR p.user_id <> $2)
       ON CONFLICT (partner_id, day)
       DO UPDATE SET ${column} = partner_daily_stats.${column} + 1`,
      [id, request.user?.id ?? null],
    );
    return { counted: true };
  });
}
