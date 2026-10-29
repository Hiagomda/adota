import {
  EVENT_TIME_ZONE,
  communityEventSchema,
  eventCancelSchema,
  eventListQuerySchema,
  eventRegistrationSchema,
  eventReportSchema,
  eventResultSchema,
  eventUpdateSchema,
  eventWindow,
  insideServiceArea,
  looksLikeAnimalSale,
  neighborhoodFromPlace,
  spotsLeft,
  verifiedOnlyCategories,
  type EventCategory,
  type EventListQuery,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { canOrganizeEvents } from './adoption.js';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyPeople } from './notify.js';
import { rowsOf, type SessionUser } from './session.js';
import { stripControls } from './text.js';

type Db = Pool | PoolClient;
type RouteLimit = { config: object };

const PAGE_SIZE = 30;
const HISTORY_LIMIT = 30;
const PARTICIPANTS_LIMIT = 500;
/** Quem organiza marca presença de uma hora antes até uma semana depois do fim. */
const CHECK_IN_BEFORE_MS = 60 * 60 * 1000;
const CHECK_IN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const NOT_FOUND = 'Esse evento não existe mais.';

export const categoryLabel: Record<EventCategory, string> = {
  adoption_fair: 'Feira de adoção',
  vaccination: 'Vacinação',
  neutering: 'Castração',
  fundraising: 'Arrecadação',
  community: 'Ação comunitária',
};

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function eventId(params: unknown): string {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, NOT_FOUND);
  return parsed.data.id;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return stripControls(value).trim() || null;
}

/** "sábado, 7 nov, 9h" no relógio de Belém, para os avisos. */
export function belemWhen(date: Date): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const minute = get('minute');
  const hour = `${Number(get('hour'))}h${minute === '00' ? '' : minute}`;
  return `${get('weekday')}, ${get('day')} ${get('month').replace('.', '')}, ${hour}`;
}

export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordChange(
  db: Db,
  id: string,
  actorId: string | null,
  kind: string,
  changes: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `INSERT INTO event_changes (event_id, actor_id, kind, changes) VALUES ($1, $2, $3, $4::jsonb)`,
    [id, actorId, kind, JSON.stringify(changes)],
  );
}

/** Quem está inscrito ou na fila: recebe aviso de mudança e de cancelamento. */
async function attendeeIds(db: Db, id: string, statuses: string[]): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(
    `SELECT user_id FROM event_registrations WHERE event_id = $1 AND status = ANY($2::text[])`,
    [id, statuses],
  );
  return result.rows.map((row) => row.user_id);
}

/**
 * Passa gente da fila de espera para as vagas abertas, na ordem em que entrou. Roda com o
 * evento travado (FOR UPDATE), então duas desistências ao mesmo tempo não dão a mesma vaga.
 */
export async function fillOpenSpots(client: PoolClient, id: string): Promise<string[]> {
  const found = await client.query<{ capacity: number | null; registered: number }>(
    `SELECT e.capacity,
            (SELECT count(*) FROM event_registrations r
              WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered
     FROM adoption_events e WHERE e.id = $1`,
    [id],
  );
  const row = found.rows[0];
  if (!row) return [];
  const open = row.capacity === null ? PARTICIPANTS_LIMIT : row.capacity - row.registered;
  if (open <= 0) return [];
  const promoted = await client.query<{ user_id: string }>(
    `UPDATE event_registrations SET status = 'registered', updated_at = now()
     WHERE id IN (
       SELECT id FROM event_registrations
       WHERE event_id = $1 AND status = 'waitlist'
       ORDER BY queued_at ASC, id ASC
       LIMIT $2
     )
     RETURNING user_id`,
    [id, open],
  );
  return promoted.rows.map((r) => r.user_id);
}

interface LockedEvent {
  id: string;
  user_id: string;
  title: string;
  category: EventCategory;
  capacity: number | null;
  starts_at: Date;
  ends_at: Date;
  hidden: boolean;
  review_status: string;
  cancelled_at: Date | null;
  version: number;
  place_label: string;
}

async function lockEvent(client: PoolClient, id: string): Promise<LockedEvent> {
  const found = await client.query<LockedEvent>(
    `SELECT id, user_id, title, category, capacity, starts_at, ends_at, hidden, review_status,
            cancelled_at, version, place_label
     FROM adoption_events WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = found.rows[0];
  if (!row) throw new HttpError(404, NOT_FOUND);
  return row;
}

function canManage(event: { user_id: string }, user: SessionUser | null): boolean {
  if (!user) return false;
  return event.user_id === user.id || isOperator(user.role);
}

/** Cancela, guarda no histórico e avisa quem estava inscrito ou na fila. */
export async function cancelEvent(
  pool: Pool,
  env: Env,
  id: string,
  user: SessionUser,
  reason: string,
  log: (error: unknown) => void,
): Promise<void> {
  const cancelled = await inTransaction(pool, async (client) => {
    const event = await lockEvent(client, id);
    if (!canManage(event, user) || event.hidden) throw new HttpError(404, NOT_FOUND);
    if (event.cancelled_at) throw new HttpError(409, 'Esse evento já foi cancelado.');
    if (event.ends_at.getTime() <= Date.now()) {
      throw new HttpError(400, 'Esse evento já terminou. Conte como foi em vez de cancelar.');
    }
    await client.query(
      `UPDATE adoption_events
       SET cancelled_at = now(), cancel_reason = $2, version = version + 1, updated_at = now()
       WHERE id = $1`,
      [id, reason],
    );
    await recordChange(client, id, user.id, 'cancelled', { reason });
    return {
      title: event.title,
      published: event.review_status === 'published',
      people: await attendeeIds(client, id, ['registered', 'waitlist']),
    };
  });
  if (!cancelled.published) return;
  await notifyPeople(pool, env, cancelled.people, 'event_cancelled', {
    title: 'Evento cancelado',
    body: `${cancelled.title} foi cancelado: ${reason}`,
    route: `/evento/${id}`,
  }).catch(log);
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  place_label: string;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  starts_at: Date;
  ends_at: Date;
  capacity: number | null;
  needs: string[];
  needs_note: string | null;
  review_status: string;
  review_note: string | null;
  hidden: boolean;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  version: number;
  result_summary: string | null;
  result_adoptions: number | null;
  result_animals_served: number | null;
  result_recorded_at: Date | null;
  registered: number;
  waitlisted: number;
  attended: number;
  distance_m: number | null;
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  role: string;
  my_status: string | null;
  my_confirmed_at: Date | null;
  my_checked_in_at: Date | null;
  my_position: number | null;
}

/** Colunas de um evento com contagens e a inscrição de quem pede ($1 = pessoa ou null). */
const eventColumns = `
  e.id, e.title, e.description, e.category, e.place_label, e.neighborhood,
  ST_Y(e.location::geometry) AS latitude, ST_X(e.location::geometry) AS longitude,
  e.starts_at, e.ends_at, e.capacity, e.needs, e.needs_note, e.review_status, e.review_note,
  e.hidden, e.cancelled_at, e.cancel_reason, e.version,
  e.result_summary, e.result_adoptions, e.result_animals_served, e.result_recorded_at,
  (SELECT count(*) FROM event_registrations r
    WHERE r.event_id = e.id AND r.status = 'registered')::int AS registered,
  (SELECT count(*) FROM event_registrations r
    WHERE r.event_id = e.id AND r.status = 'waitlist')::int AS waitlisted,
  (SELECT count(*) FROM event_registrations r
    WHERE r.event_id = e.id AND r.checked_in_at IS NOT NULL)::int AS attended,
  u.id AS user_id, u.name, u.handle, u.avatar_url, u.verified, u.role,
  mine.status AS my_status, mine.confirmed_at AS my_confirmed_at,
  mine.checked_in_at AS my_checked_in_at,
  CASE WHEN mine.status = 'waitlist' THEN (
    SELECT count(*) FROM event_registrations w
    WHERE w.event_id = e.id AND w.status = 'waitlist'
      AND (w.queued_at, w.id) <= (mine.queued_at, mine.id)
  )::int END AS my_position`;

const eventJoins = `
  FROM adoption_events e
  JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL AND u.suspended = false
  LEFT JOIN event_registrations mine ON mine.event_id = e.id AND mine.user_id = $1`;

/** Ninguém vê evento de quem bloqueou ou foi bloqueado. */
const notBlocked = `($1::uuid IS NULL OR NOT EXISTS (
  SELECT 1 FROM blocks b
  WHERE (b.blocker_id = $1 AND b.blocked_id = e.user_id)
     OR (b.blocker_id = e.user_id AND b.blocked_id = $1)
))`;

export function eventState(
  row: Pick<EventRow, 'cancelled_at' | 'starts_at' | 'ends_at'>,
  now = Date.now(),
): 'cancelled' | 'finished' | 'happening' | 'scheduled' {
  if (row.cancelled_at) return 'cancelled';
  if (row.ends_at.getTime() <= now) return 'finished';
  if (row.starts_at.getTime() <= now) return 'happening';
  return 'scheduled';
}

function present(env: Env, row: EventRow, viewer: SessionUser | null) {
  const manage = canManage(row, viewer);
  const state = eventState(row);
  const open = state === 'scheduled' || state === 'happening';
  const published = row.review_status === 'published' && !row.hidden;
  const mine = row.my_status && row.my_status !== 'cancelled' ? row.my_status : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    placeLabel: row.place_label,
    neighborhood: row.neighborhood,
    // Evento é em lugar público: o ponto vai exato, como nas feiras.
    location: { latitude: row.latitude, longitude: row.longitude },
    distanceKm: row.distance_m === null ? null : Math.round(row.distance_m / 100) / 10,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    state,
    capacity: row.capacity,
    registered: row.registered,
    waitlisted: row.waitlisted,
    spotsLeft: spotsLeft(row.capacity, row.registered),
    needs: row.needs,
    needsNote: row.needs_note,
    reviewStatus: row.review_status,
    // O motivo da recusa é só de quem organiza.
    reviewNote: manage ? row.review_note : null,
    cancelReason: row.cancel_reason,
    version: row.version,
    result: row.result_recorded_at
      ? {
          summary: row.result_summary,
          adoptions: row.result_adoptions,
          animalsServed: row.result_animals_served,
          attended: row.attended,
          recordedAt: row.result_recorded_at.toISOString(),
        }
      : null,
    organizer: {
      id: row.user_id,
      name: row.name,
      handle: row.handle,
      avatarUrl: row.avatar_url ? publicMediaUrl(env, row.avatar_url, 'thumb') : null,
      verified: row.verified,
      role: row.role,
    },
    registration: mine
      ? {
          status: mine,
          position: row.my_position,
          confirmedAt: row.my_confirmed_at?.toISOString() ?? null,
          checkedInAt: row.my_checked_in_at?.toISOString() ?? null,
        }
      : null,
    permissions: {
      canManage: manage,
      canEdit: manage && open && state === 'scheduled',
      canCancel: manage && open,
      canRecordResult: manage && state !== 'scheduled' && state !== 'cancelled',
      canRegister:
        Boolean(viewer) && !manage && published && open && !mine && row.user_id !== viewer?.id,
    },
  };
}

export type PresentedEvent = ReturnType<typeof present>;

async function loadEvent(
  pool: Pool,
  env: Env,
  id: string,
  viewer: SessionUser | null,
): Promise<PresentedEvent> {
  const result = await pool.query<EventRow>(
    `SELECT ${eventColumns}, NULL::float AS distance_m ${eventJoins}
     WHERE e.id = $2 AND ${notBlocked}`,
    [viewer?.id ?? null, id],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, NOT_FOUND);
  const visible = row.review_status === 'published' && !row.hidden;
  if (!visible && !canManage(row, viewer)) throw new HttpError(404, NOT_FOUND);
  return present(env, row, viewer);
}

function encodeCursor(row: { starts_at: Date; id: string }): string {
  return `${row.starts_at.toISOString()}_${row.id}`;
}

function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  const [at, id] = cursor.split('_');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !z.string().uuid().safeParse(id).success) {
    throw new HttpError(400, 'Confira os filtros e tente de novo.');
  }
  return { at, id };
}

export async function listEvents(
  pool: Pool,
  env: Env,
  viewer: SessionUser | null,
  query: EventListQuery,
) {
  if (query.mine && !viewer) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const window = eventWindow(query);
  const past = window.past;
  const near =
    query.latitude !== undefined && query.longitude !== undefined
      ? { latitude: query.latitude, longitude: query.longitude, radiusKm: query.radiusKm ?? 10 }
      : null;
  const cursor = decodeCursor(query.cursor);
  const params: unknown[] = [viewer?.id ?? null];
  const where: string[] = [notBlocked];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (query.mine === 'organizing') {
    // Os próprios eventos aparecem também enquanto esperam a equipe ou depois de recusados.
    where.push(`e.user_id = $1 AND e.hidden = false`);
  } else {
    where.push(`e.hidden = false AND e.review_status = 'published'`);
    if (query.mine === 'registered') where.push(`mine.status IN ('registered', 'waitlist')`);
  }
  if (query.category) where.push(`e.category = ${add(query.category)}`);
  if (query.neighborhood) where.push(`lower(e.neighborhood) = lower(${add(query.neighborhood)})`);
  if (past) {
    where.push(`e.ends_at <= now()`);
  } else if (window.from && window.to) {
    // Calendário e períodos: tudo que acontece dentro da janela, cancelados inclusive (avisa).
    where.push(`e.starts_at < ${add(window.to)} AND e.ends_at > ${add(window.from)}`);
  } else {
    where.push(`e.ends_at > now()`);
  }
  let distance = 'NULL::float';
  if (near) {
    const point = `ST_SetSRID(ST_MakePoint(${add(near.longitude)}, ${add(near.latitude)}), 4326)::geography`;
    distance = `ST_Distance(e.location, ${point})`;
    where.push(`ST_DWithin(e.location, ${point}, ${add(near.radiusKm * 1000)})`);
  }
  if (cursor) {
    const comparison = past ? '<' : '>';
    where.push(
      `(e.starts_at, e.id) ${comparison} (${add(cursor.at)}::timestamptz, ${add(cursor.id)}::uuid)`,
    );
  }
  const order = past ? 'e.starts_at DESC, e.id DESC' : 'e.starts_at ASC, e.id ASC';
  const result = await pool.query<EventRow>(
    `SELECT ${eventColumns}, ${distance} AS distance_m ${eventJoins}
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}
     LIMIT ${PAGE_SIZE + 1}`,
    params,
  );
  const rows = rowsOf<EventRow>(result);
  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    canCreate: Boolean(viewer && !viewer.suspended),
    canCreateVerifiedOnly: viewer ? canOrganizeEvents(viewer) : false,
    events: page.map((row) => present(env, row, viewer)),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

function assertCategoryAllowed(user: SessionUser, category: EventCategory): void {
  if (verifiedOnlyCategories.includes(category) && !canOrganizeEvents(user)) {
    throw new HttpError(
      403,
      category === 'adoption_fair'
        ? 'Só ONG ou protetor verificado divulga feira de adoção.'
        : 'Só ONG ou protetor verificado divulga arrecadação.',
    );
  }
}

function assertNoSale(...texts: (string | null)[]): void {
  if (texts.some((value) => value && looksLikeAnimalSale(value))) {
    throw new HttpError(400, 'Não é permitido vender animais. Evento aqui é sem venda de animal.');
  }
}

export function registerEventRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; strictLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, strictLimit } = deps;
  const bestEffort =
    (request: { log: { error: (value: object, message: string) => void } }, where: string) =>
    (error: unknown) => {
      request.log.error({ err: error, where }, 'best-effort');
    };

  app.get('/events', async (request) => {
    const query = parse(eventListQuerySchema, request.query ?? {});
    return listEvents(pool, env, request.user, query);
  });

  // Bairros com eventos marcados, para os filtros de região.
  app.get('/events/regions', async () => {
    const result = await pool.query<{ neighborhood: string; events: number }>(
      `SELECT min(neighborhood) AS neighborhood, count(*)::int AS events
       FROM adoption_events
       WHERE hidden = false AND review_status = 'published' AND cancelled_at IS NULL
         AND ends_at > now() AND neighborhood IS NOT NULL
       GROUP BY lower(neighborhood)
       ORDER BY count(*) DESC, min(neighborhood) ASC
       LIMIT 30`,
    );
    return { regions: result.rows };
  });

  app.get('/events/:id', async (request) => {
    const id = eventId(request.params);
    const event = await loadEvent(pool, env, id, request.user);
    const history = await pool.query<{
      kind: string;
      changes: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT kind, changes, created_at FROM event_changes
       WHERE event_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_LIMIT}`,
      [id],
    );
    return {
      event,
      // O histórico mostra o que mudou, nunca quem da equipe mexeu.
      history: history.rows.map((row) => ({
        kind: row.kind,
        fields: Object.keys(row.changes).filter((key) => key !== 'note'),
        reason: row.kind === 'cancelled' ? (row.changes.reason ?? null) : null,
        at: row.created_at.toISOString(),
      })),
    };
  });

  app.post('/events', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const input = parse(communityEventSchema, request.body);
    assertCategoryAllowed(user, input.category);
    if (Date.parse(input.endsAt) <= Date.now()) {
      throw new HttpError(400, 'Esse evento já terminou. Confira o dia e a hora.');
    }
    if (!insideServiceArea(input)) {
      throw new HttpError(400, 'Por enquanto o Égua, adota! funciona só em Belém e região.');
    }
    const title = stripControls(input.title).trim();
    const description = clean(input.description);
    const needsNote = clean(input.needsNote);
    const placeLabel = stripControls(input.placeLabel).trim();
    assertNoSale(title, description, needsNote);
    const reviewStatus = canOrganizeEvents(user) ? 'published' : 'pending';
    const created = await inTransaction(pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO adoption_events (
           user_id, title, description, category, place_label, neighborhood, location,
           starts_at, ends_at, capacity, needs, needs_note, review_status, client_key
         ) VALUES (
           $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
           $9, $10, $11, $12::text[], $13, $14, $15
         )
         ON CONFLICT (user_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          user.id,
          title,
          description,
          input.category,
          placeLabel,
          neighborhoodFromPlace(placeLabel),
          input.longitude,
          input.latitude,
          input.startsAt,
          input.endsAt,
          input.capacity ?? null,
          input.needs ?? [],
          needsNote,
          reviewStatus,
          input.clientKey ?? null,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) {
        // O mesmo cadastro chegou de novo: devolve o que já existe.
        const existing = await client.query<{ id: string; review_status: string }>(
          `SELECT id, review_status FROM adoption_events WHERE user_id = $1 AND client_key = $2`,
          [user.id, input.clientKey],
        );
        const found = existing.rows[0];
        if (!found) throw new HttpError(409, 'Não consegui salvar. Tente de novo.');
        return { id: found.id, reviewStatus: found.review_status, repeated: true };
      }
      await recordChange(client, id, user.id, 'created', { category: input.category });
      return { id, reviewStatus, repeated: false };
    });
    return reply
      .code(created.repeated ? 200 : 201)
      .send({ id: created.id, reviewStatus: created.reviewStatus });
  });

  app.patch('/events/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const id = eventId(request.params);
    const input = parse(eventUpdateSchema, request.body);
    if (input.category) assertCategoryAllowed(user, input.category);
    if (input.latitude !== undefined && input.longitude !== undefined) {
      if (!insideServiceArea({ latitude: input.latitude, longitude: input.longitude })) {
        throw new HttpError(400, 'Por enquanto o Égua, adota! funciona só em Belém e região.');
      }
    }
    if (input.endsAt && Date.parse(input.endsAt) <= Date.now()) {
      throw new HttpError(400, 'Esse horário já passou. Confira o dia e a hora.');
    }
    const title = input.title === undefined ? undefined : stripControls(input.title).trim();
    const description = input.description === undefined ? undefined : clean(input.description);
    const needsNote = input.needsNote === undefined ? undefined : clean(input.needsNote);
    const placeLabel =
      input.placeLabel === undefined ? undefined : stripControls(input.placeLabel).trim();
    assertNoSale(title ?? null, description ?? null, needsNote ?? null);

    const outcome = await inTransaction(pool, async (client) => {
      const event = await lockEvent(client, id);
      if (!canManage(event, user) || event.hidden) throw new HttpError(404, NOT_FOUND);
      if (event.cancelled_at) throw new HttpError(409, 'Esse evento foi cancelado.');
      if (event.starts_at.getTime() <= Date.now()) {
        throw new HttpError(409, 'O evento já começou. Não dá mais para mudar.');
      }
      if (event.version !== input.version) {
        throw new HttpError(
          409,
          'Alguém mudou este evento antes de você. Abra de novo para ver como ficou.',
        );
      }
      const registered = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM event_registrations
         WHERE event_id = $1 AND status = 'registered'`,
        [id],
      );
      const already = registered.rows[0]?.count ?? 0;
      if (input.capacity !== undefined && input.capacity !== null && input.capacity < already) {
        throw new HttpError(
          400,
          `Já tem ${already} inscritos. O limite não pode ficar abaixo disso.`,
        );
      }

      const sets: string[] = [];
      const values: unknown[] = [id];
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const set = (column: string, value: unknown, cast = '') => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };
      const before = await client.query<{
        title: string;
        description: string | null;
        category: string;
        place_label: string;
        starts_at: Date;
        ends_at: Date;
        capacity: number | null;
        needs: string[];
        needs_note: string | null;
        latitude: number;
        longitude: number;
      }>(
        `SELECT title, description, category, place_label, starts_at, ends_at, capacity, needs,
                needs_note, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
         FROM adoption_events WHERE id = $1`,
        [id],
      );
      const old = before.rows[0];
      if (!old) throw new HttpError(404, NOT_FOUND);

      const compare = (field: string, from: unknown, to: unknown) => {
        if (to === undefined) return false;
        const same = JSON.stringify(from) === JSON.stringify(to);
        if (!same) changes[field] = { from, to };
        return !same;
      };
      if (compare('title', old.title, title)) set('title', title);
      if (compare('description', old.description, description)) set('description', description);
      if (compare('category', old.category, input.category)) set('category', input.category);
      if (compare('placeLabel', old.place_label, placeLabel)) {
        set('place_label', placeLabel);
        set('neighborhood', neighborhoodFromPlace(placeLabel ?? ''));
      }
      if (input.startsAt && input.endsAt) {
        const startsChanged = compare(
          'startsAt',
          old.starts_at.toISOString(),
          new Date(input.startsAt).toISOString(),
        );
        const endsChanged = compare(
          'endsAt',
          old.ends_at.toISOString(),
          new Date(input.endsAt).toISOString(),
        );
        if (startsChanged || endsChanged) {
          set('starts_at', input.startsAt);
          set('ends_at', input.endsAt);
        }
      }
      if (compare('capacity', old.capacity, input.capacity)) set('capacity', input.capacity);
      if (compare('needs', old.needs, input.needs)) set('needs', input.needs, '::text[]');
      if (compare('needsNote', old.needs_note, needsNote)) set('needs_note', needsNote);
      if (input.latitude !== undefined && input.longitude !== undefined) {
        const moved =
          Math.abs(old.latitude - input.latitude) > 1e-6 ||
          Math.abs(old.longitude - input.longitude) > 1e-6;
        if (moved) {
          changes.location = { from: null, to: null };
          values.push(input.longitude, input.latitude);
          sets.push(
            `location = ST_SetSRID(ST_MakePoint($${values.length - 1}, $${values.length}), 4326)::geography`,
          );
        }
      }
      if (sets.length === 0)
        return { changed: [] as string[], people: [], promoted: [], title: old.title };

      // Texto novo de quem não tem selo volta para a equipe ver antes de aparecer.
      const textChanged = ['title', 'description', 'needsNote', 'category'].some(
        (field) => field in changes,
      );
      const backToReview =
        textChanged && !canOrganizeEvents(user) && event.review_status === 'published';
      if (backToReview) sets.push(`review_status = 'pending'`);
      await client.query(
        `UPDATE adoption_events SET ${sets.join(', ')}, version = version + 1, updated_at = now()
         WHERE id = $1`,
        values,
      );
      await recordChange(client, id, user.id, 'updated', changes);
      const promoted = await fillOpenSpots(client, id);
      const important = ['startsAt', 'endsAt', 'placeLabel', 'location'].some(
        (field) => field in changes,
      );
      const people =
        important && event.review_status === 'published' && !backToReview
          ? await attendeeIds(client, id, ['registered', 'waitlist'])
          : [];
      return { changed: Object.keys(changes), people, promoted, title: title ?? old.title };
    });

    const log = bestEffort(request, 'notify:event-changed');
    if (outcome.people.length > 0) {
      const event = await loadEvent(pool, env, id, null);
      await notifyPeople(pool, env, outcome.people, 'event_changed', {
        title: 'O evento mudou',
        body: `${outcome.title}: agora ${belemWhen(new Date(event.startsAt))}, em ${event.placeLabel}.`,
        route: `/evento/${id}`,
      }).catch(log);
    }
    if (outcome.promoted.length > 0) {
      await notifyPeople(pool, env, outcome.promoted, 'event_spot', {
        title: 'Abriu uma vaga para você',
        body: `Você saiu da fila de espera e está inscrito em ${outcome.title}.`,
        route: `/evento/${id}`,
      }).catch(log);
    }
    return { changed: outcome.changed, event: await loadEvent(pool, env, id, user) };
  });

  app.post('/events/:id/cancel', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const input = parse(eventCancelSchema, request.body);
    await cancelEvent(
      pool,
      env,
      id,
      user,
      stripControls(input.reason).trim(),
      bestEffort(request, 'notify:event-cancelled'),
    );
    return { event: await loadEvent(pool, env, id, user) };
  });

  // Inscrição. Repetir o pedido (internet caiu) devolve a mesma inscrição.
  app.post('/events/:id/registrations', writeLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const id = eventId(request.params);
    const input = parse(eventRegistrationSchema, request.body ?? {});
    const note = clean(input.note);
    assertNoSale(note);
    const result = await inTransaction(pool, async (client) => {
      const event = await lockEvent(client, id);
      const blocked = await client.query(
        `SELECT 1 FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [user.id, event.user_id],
      );
      if (event.hidden || event.review_status !== 'published' || (blocked.rowCount ?? 0) > 0) {
        throw new HttpError(404, NOT_FOUND);
      }
      if (event.user_id === user.id) throw new HttpError(400, 'Você organiza este evento.');
      if (event.cancelled_at) throw new HttpError(409, 'Esse evento foi cancelado.');
      if (event.ends_at.getTime() <= Date.now()) {
        throw new HttpError(409, 'Esse evento já terminou.');
      }
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
        [id, user.id],
      );
      const current = existing.rows[0]?.status;
      if (current === 'registered' || current === 'waitlist') {
        if (note !== null) {
          await client.query(
            `UPDATE event_registrations SET note = $3, updated_at = now()
             WHERE event_id = $1 AND user_id = $2`,
            [id, user.id, note],
          );
        }
        return { status: current, created: false };
      }
      const counted = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM event_registrations
         WHERE event_id = $1 AND status = 'registered'`,
        [id],
      );
      const full = event.capacity !== null && (counted.rows[0]?.count ?? 0) >= event.capacity;
      const status = full ? 'waitlist' : 'registered';
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id, user_id) DO UPDATE
         SET status = EXCLUDED.status, note = EXCLUDED.note, queued_at = now(),
             confirmed_at = NULL, checked_in_at = NULL, cancelled_at = NULL, updated_at = now()`,
        [id, user.id, status, note],
      );
      return { status, created: true };
    });
    const event = await loadEvent(pool, env, id, user);
    return reply.code(result.created ? 201 : 200).send({ status: result.status, event });
  });

  app.delete('/events/:id/registrations/me', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const outcome = await inTransaction(pool, async (client) => {
      const event = await lockEvent(client, id);
      if (event.ends_at.getTime() <= Date.now()) {
        throw new HttpError(409, 'Esse evento já terminou.');
      }
      const updated = await client.query<{ before: string }>(
        `UPDATE event_registrations r
         SET status = 'cancelled', cancelled_at = now(), confirmed_at = NULL, updated_at = now()
         FROM (SELECT id, status FROM event_registrations
               WHERE event_id = $1 AND user_id = $2 FOR UPDATE) old
         WHERE r.id = old.id AND old.status IN ('registered', 'waitlist')
         RETURNING old.status AS before`,
        [id, user.id],
      );
      // Já estava fora: cancelar de novo não é erro (o celular pode ter reenviado).
      if ((updated.rowCount ?? 0) === 0) return { promoted: [] as string[], title: event.title };
      const promoted = event.cancelled_at ? [] : await fillOpenSpots(client, id);
      return { promoted, title: event.title };
    });
    if (outcome.promoted.length > 0) {
      await notifyPeople(pool, env, outcome.promoted, 'event_spot', {
        title: 'Abriu uma vaga para você',
        body: `Você saiu da fila de espera e está inscrito em ${outcome.title}.`,
        route: `/evento/${id}`,
      }).catch(bestEffort(request, 'notify:event-spot'));
    }
    return { status: 'cancelled', event: await loadEvent(pool, env, id, user) };
  });

  // A pessoa confirma que vai: quem organiza vê quantos confirmaram.
  app.post('/events/:id/registrations/me/confirm', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const updated = await pool.query(
      `UPDATE event_registrations r SET confirmed_at = coalesce(r.confirmed_at, now()), updated_at = now()
       FROM adoption_events e
       WHERE r.event_id = $1 AND r.user_id = $2 AND e.id = r.event_id
         AND r.status = 'registered' AND e.cancelled_at IS NULL AND e.ends_at > now()`,
      [id, user.id],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw new HttpError(409, 'Só quem está inscrito confirma presença antes do fim do evento.');
    }
    return { event: await loadEvent(pool, env, id, user) };
  });

  // Lista de participantes: só quem organiza e a equipe. Sem telefone nem e-mail.
  app.get('/events/:id/participants', async (request) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const event = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM adoption_events WHERE id = $1`,
      [id],
    );
    const found = event.rows[0];
    if (!found || !canManage(found, user)) {
      throw new HttpError(403, 'Só quem organiza vê a lista de participantes.');
    }
    const result = await pool.query<{
      user_id: string;
      name: string;
      handle: string;
      avatar_url: string | null;
      verified: boolean;
      status: string;
      note: string | null;
      confirmed_at: Date | null;
      checked_in_at: Date | null;
      queued_at: Date;
    }>(
      `SELECT r.user_id, u.name, u.handle, u.avatar_url, u.verified, r.status, r.note,
              r.confirmed_at, r.checked_in_at, r.queued_at
       FROM event_registrations r
       JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
       WHERE r.event_id = $1 AND r.status IN ('registered', 'waitlist')
       ORDER BY (r.status = 'waitlist') ASC, r.queued_at ASC, r.id ASC
       LIMIT ${PARTICIPANTS_LIMIT}`,
      [id],
    );
    return {
      participants: result.rows.map((row) => ({
        person: {
          id: row.user_id,
          name: row.name,
          handle: row.handle,
          avatarUrl: row.avatar_url ? publicMediaUrl(env, row.avatar_url, 'thumb') : null,
          verified: row.verified,
        },
        status: row.status,
        note: row.note,
        confirmedAt: row.confirmed_at?.toISOString() ?? null,
        checkedInAt: row.checked_in_at?.toISOString() ?? null,
        registeredAt: row.queued_at.toISOString(),
      })),
    };
  });

  app.post('/events/:id/participants/:userId/attendance', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const params = z
      .object({ id: z.string().uuid(), userId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success) throw new HttpError(404, NOT_FOUND);
    const body = parse(z.object({ attended: z.boolean() }).strict(), request.body);
    const event = await pool.query<{
      user_id: string;
      starts_at: Date;
      ends_at: Date;
      cancelled_at: Date | null;
    }>(`SELECT user_id, starts_at, ends_at, cancelled_at FROM adoption_events WHERE id = $1`, [
      params.data.id,
    ]);
    const found = event.rows[0];
    if (!found || !canManage(found, user)) {
      throw new HttpError(403, 'Só quem organiza marca a presença.');
    }
    const now = Date.now();
    if (
      found.cancelled_at ||
      now < found.starts_at.getTime() - CHECK_IN_BEFORE_MS ||
      now > found.ends_at.getTime() + CHECK_IN_AFTER_MS
    ) {
      throw new HttpError(409, 'A presença é marcada no dia do evento ou na semana seguinte.');
    }
    const updated = await pool.query(
      `UPDATE event_registrations
       SET checked_in_at = CASE WHEN $3::boolean THEN coalesce(checked_in_at, now()) END,
           updated_at = now()
       WHERE event_id = $1 AND user_id = $2 AND status = 'registered'`,
      [params.data.id, params.data.userId, body.attended],
    );
    if ((updated.rowCount ?? 0) === 0) throw new HttpError(404, 'Essa pessoa não está inscrita.');
    return { attended: body.attended };
  });

  app.post('/events/:id/result', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const input = parse(eventResultSchema, request.body);
    const summary = stripControls(input.summary).trim();
    assertNoSale(summary);
    await inTransaction(pool, async (client) => {
      const event = await lockEvent(client, id);
      if (!canManage(event, user) || event.hidden) throw new HttpError(404, NOT_FOUND);
      if (event.cancelled_at) throw new HttpError(409, 'Esse evento foi cancelado.');
      if (event.starts_at.getTime() > Date.now()) {
        throw new HttpError(409, 'Conte como foi depois que o evento começar.');
      }
      await client.query(
        `UPDATE adoption_events
         SET result_summary = $2, result_adoptions = $3, result_animals_served = $4,
             result_recorded_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, summary, input.adoptions ?? null, input.animalsServed ?? null],
      );
      await recordChange(client, id, user.id, 'result', {
        adoptions: input.adoptions ?? null,
        animalsServed: input.animalsServed ?? null,
      });
    });
    return { event: await loadEvent(pool, env, id, user) };
  });

  app.post('/events/:id/report', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const id = eventId(request.params);
    const input = parse(eventReportSchema, request.body);
    const event = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM adoption_events WHERE id = $1 AND hidden = false`,
      [id],
    );
    const found = event.rows[0];
    if (!found) throw new HttpError(404, NOT_FOUND);
    if (found.user_id === user.id) throw new HttpError(400, 'Esse evento é seu.');
    await pool.query(
      `INSERT INTO event_reports (event_id, user_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      [id, user.id, stripControls(input.reason).trim()],
    );
    return reply.code(201).send({ reported: true });
  });
}
