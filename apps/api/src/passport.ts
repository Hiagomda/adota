import {
  animalLinkSchema,
  custodyChange,
  healthRecordSchema,
  looksLikeAnimalSale,
  type HealthRecordInput,
} from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyPeople } from './notify.js';
import { diaryKind } from './feed.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type Db = Pool | PoolClient;
type RouteLimit = { config: object };

/** Uma junção aponta para outra; mais que isso é dado quebrado, não histórico. */
const MAX_MERGE_HOPS = 5;
const TIMELINE_LIMIT = 120;
const PHOTOS_LIMIT = 8;

const idParams = z.object({ id: z.string().uuid() });
const recordParams = z.object({ id: z.string().uuid(), recordId: z.string().uuid() });

function parseId(params: unknown, message: string): string {
  const parsed = idParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, message);
  return parsed.data.id;
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

/** O animal de verdade por trás de um id, seguindo as junções. Null se não existe. */
export async function resolveAnimal(db: Db, animalId: string): Promise<string | null> {
  let current = animalId;
  for (let hop = 0; hop <= MAX_MERGE_HOPS; hop += 1) {
    const found = await db.query<{ merged_into_id: string | null }>(
      `SELECT merged_into_id FROM animals WHERE id = $1`,
      [current],
    );
    const row = found.rows[0];
    if (!row) return null;
    if (!row.merged_into_id) return current;
    current = row.merged_into_id;
  }
  return null;
}

/**
 * Quem cuida do animal e vê os dados de saúde: a equipe, quem publicou algum post dele, quem
 * adotou e quem está com ele agora (lar temporário ou resgate em andamento).
 */
export async function isCaretaker(db: Db, animalId: string, user: SessionUser | null) {
  if (!user) return false;
  if (isOperator(user.role)) return true;
  const found = await db.query(
    `SELECT 1 FROM animals a
     WHERE a.id = $1 AND (
       a.current_owner_id = $2
       OR EXISTS (
         SELECT 1 FROM posts p
         WHERE p.animal_id = a.id AND p.parent_post_id IS NULL AND p.author_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM animal_custody c
         WHERE c.animal_id = a.id AND c.user_id = $2 AND c.ended_at IS NULL
       )
     )`,
    [animalId, user.id],
  );
  return (found.rowCount ?? 0) > 0;
}

/**
 * Atualiza com quem o animal está quando o status muda. Roda dentro da transação da mudança de
 * status. Lar temporário marcado pelo status não diz de quem é a casa (a Casa Amiga do app diz),
 * então fica sem pessoa; resgate e adoção ficam com quem marcou, como já faz `current_owner_id`.
 */
export async function recordCustody(
  db: Db,
  animalId: string,
  postId: string,
  userId: string,
  from: string,
  to: string,
  options: { fosterUserId?: string | null } = {},
): Promise<void> {
  const change = custodyChange(from, to);
  if (change.close.length > 0) {
    await db.query(
      `UPDATE animal_custody SET ended_at = now()
       WHERE animal_id = $1 AND ended_at IS NULL AND kind = ANY($2::text[])`,
      [animalId, change.close],
    );
  }
  if (!change.open) return;
  const person =
    change.open === 'foster' ? (options.fosterUserId ?? null) : (userId as string | null);
  await db.query(
    `INSERT INTO animal_custody (animal_id, kind, user_id, post_id) VALUES ($1, $2, $3, $4)`,
    [animalId, change.open, person, postId],
  );
}

interface AnimalRow {
  id: string;
  species: string;
  size: string;
  name: string | null;
  sex: string | null;
  age_estimate: string | null;
  temperament: string | null;
  neutered: boolean | null;
  vaccinated: boolean | null;
  good_with_kids: boolean | null;
  good_with_animals: boolean | null;
  status: string;
  created_at: Date;
}

interface OccurrenceRow {
  id: string;
  type: string;
  status: string;
  approx_label: string;
  created_at: Date;
  author_id: string;
  author_name: string;
  author_handle: string;
}

interface DiaryRow {
  id: string;
  parent_post_id: string;
  description: string;
  status: string;
  created_at: Date;
  name: string;
}

interface HealthRow {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  occurred_on: string;
  next_due_on: string | null;
  visibility: 'public' | 'caretakers';
  recorded_by: string | null;
  recorder_name: string | null;
  created_at: Date;
}

interface CustodyRow {
  id: string;
  kind: 'rescue' | 'foster' | 'adoption';
  user_id: string | null;
  name: string | null;
  handle: string | null;
  started_at: Date;
  ended_at: Date | null;
}

interface SightingRow {
  id: string;
  post_id: string;
  approx_label: string | null;
  created_at: Date;
}

interface LinkRow {
  id: string;
  from_animal_id: string;
  to_animal_id: string;
  reason: string;
  created_at: Date;
  requester_name: string | null;
  other_post_id: string | null;
  other_label: string | null;
}

const statusTitles: Record<string, string> = {
  open: 'Resgate aberto',
  on_the_way: 'Alguém foi ajudar',
  not_found: 'Não foi encontrado no lugar',
  rescued: 'Saiu da rua',
  fostered: 'Foi para um lar temporário',
  for_adoption: 'Ficou disponível para adoção',
  adopted: 'Foi adotado',
};

const occurrenceTitles: Record<string, string> = {
  rescue_alert: 'Pedido de resgate publicado',
  lost: 'Anunciado como perdido',
  adoption: 'Publicado para adoção',
  help_request: 'Pedido de ajuda publicado',
  update: 'Publicação',
};

const healthTitles: Record<string, string> = {
  vaccine: 'Vacina',
  deworming: 'Vermífugo',
  neutering: 'Castração',
  treatment: 'Tratamento',
  medication: 'Remédio',
  exam: 'Exame',
  vet_visit: 'Consulta',
};

const custodyTitles: Record<string, string> = {
  rescue: 'Ficou com quem resgatou',
  foster: 'Lar temporário',
  adoption: 'Adoção',
};

/** A data de um dia do calendário vira meio-dia em Belém, para não cair no dia anterior. */
function dayToIso(day: string): string {
  return new Date(`${day}T12:00:00-03:00`).toISOString();
}

export async function loadPassport(
  pool: Pool,
  env: Env,
  requestedId: string,
  viewer: SessionUser | null,
) {
  const animalId = await resolveAnimal(pool, requestedId);
  if (!animalId) throw new HttpError(404, 'Esse animal não existe.');
  const caretaker = await isCaretaker(pool, animalId, viewer);
  const animalResult = await pool.query<AnimalRow>(
    `SELECT id, species, size, name, sex, age_estimate, temperament, neutered, vaccinated,
            good_with_kids, good_with_animals, status, created_at
     FROM animals WHERE id = $1`,
    [animalId],
  );
  const animal = animalResult.rows[0];
  if (!animal) throw new HttpError(404, 'Esse animal não existe.');

  // Só posts que qualquer pessoa vê no feed; quem bloqueou ou foi bloqueado não aparece.
  const occurrences = await pool.query<OccurrenceRow>(
    `SELECT p.id, p.type, p.status, p.approx_label, p.created_at,
            u.id AS author_id, u.name AS author_name, u.handle AS author_handle
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.animal_id = $1 AND p.parent_post_id IS NULL
       AND p.hidden = false AND p.review_status = 'published'
       AND u.deleted_at IS NULL AND u.suspended = false
       AND ($2::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $2 AND b.blocked_id = p.author_id)
            OR (b.blocker_id = p.author_id AND b.blocked_id = $2)
       ))
     ORDER BY p.created_at ASC`,
    [animalId, viewer?.id ?? null],
  );
  if (occurrences.rows.length === 0 && !caretaker) {
    throw new HttpError(404, 'Esse animal não existe.');
  }
  const postIds = occurrences.rows.map((row) => row.id);

  const [diary, photos, health, custody, sightings, merged] = await Promise.all([
    pool.query<DiaryRow>(
      `SELECT p.id, p.parent_post_id, p.description, p.status, p.created_at, u.name
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.parent_post_id = ANY($1::uuid[]) AND p.hidden = false
         AND p.review_status = 'published'
       ORDER BY p.created_at ASC`,
      [postIds],
    ),
    pool.query<{ url: string }>(
      `SELECT m.url FROM post_media m JOIN posts p ON p.id = m.post_id
       WHERE (p.id = ANY($1::uuid[]) OR p.parent_post_id = ANY($1::uuid[]))
         AND p.hidden = false AND p.review_status = 'published'
       ORDER BY p.created_at DESC, m.position ASC
       LIMIT ${PHOTOS_LIMIT}`,
      [postIds],
    ),
    pool.query<HealthRow>(
      `SELECT h.id, h.kind, h.title, h.notes, to_char(h.occurred_on, 'YYYY-MM-DD') AS occurred_on,
              to_char(h.next_due_on, 'YYYY-MM-DD') AS next_due_on, h.visibility, h.recorded_by,
              u.name AS recorder_name, h.created_at
       FROM animal_health_records h LEFT JOIN users u ON u.id = h.recorded_by
       WHERE h.animal_id = $1 AND h.removed_at IS NULL
         AND ($2::boolean OR h.visibility = 'public')
       ORDER BY h.occurred_on DESC, h.created_at DESC`,
      [animalId, caretaker],
    ),
    pool.query<CustodyRow>(
      `SELECT c.id, c.kind, c.user_id, u.name, u.handle, c.started_at, c.ended_at
       FROM animal_custody c LEFT JOIN users u ON u.id = c.user_id AND u.deleted_at IS NULL
       WHERE c.animal_id = $1
       ORDER BY c.started_at ASC`,
      [animalId],
    ),
    pool.query<SightingRow>(
      `SELECT s.id, s.post_id, s.approx_label, s.created_at
       FROM sightings s JOIN users u ON u.id = s.user_id
       WHERE s.post_id = ANY($1::uuid[]) AND u.deleted_at IS NULL AND u.suspended = false
       ORDER BY s.created_at DESC LIMIT 30`,
      [postIds],
    ),
    pool.query<{ id: string }>(`SELECT id FROM animals WHERE merged_into_id = $1`, [animalId]),
  ]);

  const timeline: {
    id: string;
    kind: 'occurrence' | 'status' | 'note' | 'sighting' | 'health' | 'custody';
    date: string;
    title: string;
    detail: string | null;
    postId: string | null;
  }[] = [];
  for (const row of occurrences.rows) {
    timeline.push({
      id: `post-${row.id}`,
      kind: 'occurrence',
      date: row.created_at.toISOString(),
      title: occurrenceTitles[row.type] ?? 'Publicação',
      detail: row.approx_label,
      postId: row.id,
    });
  }
  for (const row of diary.rows) {
    // As linhas que o próprio servidor escreve ao mudar o status viram um passo; o resto é nota.
    const kind = diaryKind(row.description, row.status);
    const isStatus = kind === 'status' || row.description === 'Voltou para casa.';
    timeline.push({
      id: `diary-${row.id}`,
      kind: isStatus ? 'status' : 'note',
      date: row.created_at.toISOString(),
      title: isStatus
        ? row.description === 'Voltou para casa.'
          ? 'Voltou para casa'
          : (statusTitles[row.status] ?? 'Atualização')
        : kind === 'not_found'
          ? 'Alguém foi e não encontrou'
          : `Nota de ${firstName(row.name)}`,
      detail: isStatus || kind === 'not_found' ? null : row.description.slice(0, 280),
      postId: row.parent_post_id,
    });
  }
  for (const row of sightings.rows) {
    timeline.push({
      id: `sighting-${row.id}`,
      kind: 'sighting',
      date: row.created_at.toISOString(),
      title: 'Visto por alguém',
      detail: row.approx_label,
      postId: row.post_id,
    });
  }
  for (const row of health.rows) {
    timeline.push({
      id: `health-${row.id}`,
      kind: 'health',
      date: dayToIso(row.occurred_on),
      title: `${healthTitles[row.kind] ?? 'Saúde'}: ${row.title}`,
      detail: caretaker ? row.notes : null,
      postId: null,
    });
  }
  for (const row of custody.rows) {
    timeline.push({
      id: `custody-${row.id}`,
      kind: 'custody',
      date: row.started_at.toISOString(),
      title: custodyTitles[row.kind] ?? 'Guarda',
      // Lar temporário é a casa de alguém: o nome só para quem cuida.
      detail: caretaker && row.name ? row.name : null,
      postId: null,
    });
  }
  timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let pendingLinks: LinkRow[] = [];
  if (caretaker) {
    const links = await pool.query<LinkRow>(
      `SELECT l.id, l.from_animal_id, l.to_animal_id, l.reason, l.created_at,
              u.name AS requester_name,
              (SELECT p.id FROM posts p WHERE p.animal_id = l.from_animal_id
                 AND p.parent_post_id IS NULL AND p.hidden = false ORDER BY p.created_at LIMIT 1)
                AS other_post_id,
              (SELECT p.approx_label FROM posts p WHERE p.animal_id = l.from_animal_id
                 AND p.parent_post_id IS NULL AND p.hidden = false ORDER BY p.created_at LIMIT 1)
                AS other_label
       FROM animal_links l LEFT JOIN users u ON u.id = l.requested_by
       WHERE l.to_animal_id = $1 AND l.status = 'pending'
       ORDER BY l.created_at ASC`,
      [animalId],
    );
    pendingLinks = links.rows;
  }

  return {
    id: animal.id,
    requestedId,
    mergedFrom: merged.rows.map((row) => row.id),
    name: animal.name,
    species: animal.species,
    size: animal.size,
    sex: animal.sex,
    ageEstimate: animal.age_estimate,
    temperament: animal.temperament,
    status: animal.status,
    care: {
      neutered: animal.neutered,
      vaccinated: animal.vaccinated,
      goodWithKids: animal.good_with_kids,
      goodWithAnimals: animal.good_with_animals,
    },
    firstSeenAt: (occurrences.rows[0]?.created_at ?? animal.created_at).toISOString(),
    photos: photos.rows.map((row) => ({
      url: publicMediaUrl(env, row.url, 'full'),
      thumbUrl: publicMediaUrl(env, row.url, 'thumb'),
    })),
    occurrences: occurrences.rows.map((row) => ({
      postId: row.id,
      type: row.type,
      status: row.status,
      approxLabel: row.approx_label,
      createdAt: row.created_at.toISOString(),
      author: { name: row.author_name, handle: row.author_handle },
    })),
    health: health.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      notes: caretaker ? row.notes : null,
      occurredOn: row.occurred_on,
      nextDueOn: caretaker ? row.next_due_on : null,
      visibility: row.visibility,
      recordedBy: caretaker && row.recorder_name ? firstName(row.recorder_name) : null,
      canRemove: viewer !== null && (isOperator(viewer.role) || viewer.id === row.recorded_by),
    })),
    custody: custody.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at?.toISOString() ?? null,
      person: caretaker && row.name && row.handle ? { name: row.name, handle: row.handle } : null,
    })),
    timeline: timeline.slice(0, TIMELINE_LIMIT),
    permissions: {
      caretaker,
      canAddHealth: caretaker,
      canLink: caretaker,
    },
    pendingLinks: pendingLinks.map((row) => ({
      id: row.id,
      reason: row.reason,
      createdAt: row.created_at.toISOString(),
      requesterName: row.requester_name ? firstName(row.requester_name) : null,
      otherPostId: row.other_post_id,
      otherLabel: row.other_label,
    })),
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Castração e vacina registradas também respondem às perguntas de quem quer adotar. */
async function syncCareFlags(db: Db, animalId: string, input: HealthRecordInput) {
  if (input.kind === 'neutering') {
    await db.query(`UPDATE animals SET neutered = true WHERE id = $1`, [animalId]);
  }
  if (input.kind === 'vaccine') {
    await db.query(`UPDATE animals SET vaccinated = true WHERE id = $1`, [animalId]);
  }
}

/** Autores dos posts visíveis do animal: quem confirma um pedido de junção. */
async function authorsOf(db: Db, animalId: string): Promise<string[]> {
  const result = await db.query<{ author_id: string }>(
    `SELECT DISTINCT p.author_id FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.animal_id = $1 AND p.parent_post_id IS NULL AND u.deleted_at IS NULL`,
    [animalId],
  );
  return result.rows.map((row) => row.author_id);
}

/**
 * Junta `other` em `keep`: os posts, a saúde e a guarda passam para `keep`, que herda o que só
 * o outro sabia (nome, cuidados). O outro fica apontando para `keep`.
 */
export async function mergeAnimals(client: PoolClient, keep: string, other: string) {
  await client.query(`UPDATE posts SET animal_id = $1 WHERE animal_id = $2`, [keep, other]);
  await client.query(`UPDATE animal_health_records SET animal_id = $1 WHERE animal_id = $2`, [
    keep,
    other,
  ]);
  await client.query(`UPDATE animal_custody SET animal_id = $1 WHERE animal_id = $2`, [
    keep,
    other,
  ]);
  await client.query(
    `UPDATE animals k SET
       name = COALESCE(k.name, o.name),
       age_estimate = COALESCE(k.age_estimate, o.age_estimate),
       temperament = COALESCE(k.temperament, o.temperament),
       health_notes = COALESCE(k.health_notes, o.health_notes),
       sex = CASE WHEN k.sex IS NULL OR k.sex = 'unknown' THEN o.sex ELSE k.sex END,
       neutered = COALESCE(k.neutered, o.neutered),
       vaccinated = COALESCE(k.vaccinated, o.vaccinated),
       good_with_kids = COALESCE(k.good_with_kids, o.good_with_kids),
       good_with_animals = COALESCE(k.good_with_animals, o.good_with_animals),
       current_owner_id = COALESCE(k.current_owner_id, o.current_owner_id)
     FROM animals o
     WHERE k.id = $1 AND o.id = $2`,
    [keep, other],
  );
  await client.query(`UPDATE animals SET merged_into_id = $1 WHERE id = $2`, [keep, other]);
  // Junções feitas antes no outro passam a apontar direto para o que ficou.
  await client.query(`UPDATE animals SET merged_into_id = $1 WHERE merged_into_id = $2`, [
    keep,
    other,
  ]);
}

/** O mais antigo fica: é o que tem mais história e o link mais compartilhado. */
async function orderForMerge(db: Db, a: string, b: string): Promise<[string, string]> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM animals WHERE id = ANY($1::uuid[]) ORDER BY created_at ASC, id ASC`,
    [[a, b]],
  );
  const first = result.rows[0]?.id ?? a;
  return first === a ? [a, b] : [b, a];
}

async function assertSameSpecies(db: Db, a: string, b: string) {
  const result = await db.query<{ species: string }>(
    `SELECT DISTINCT species FROM animals WHERE id = ANY($1::uuid[])`,
    [[a, b]],
  );
  if (result.rows.length > 1) {
    throw new HttpError(400, 'São espécies diferentes: não pode ser o mesmo animal.');
  }
}

async function withTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function bestEffort(request: FastifyRequest, where: string) {
  return (error: unknown) => {
    request.log.error({ err: error, where }, 'best-effort step failed');
  };
}

export function registerPassportRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; publishLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, publishLimit } = deps;

  app.get('/animals/:id', async (request) => {
    const id = parseId(request.params, 'Esse animal não existe.');
    return loadPassport(pool, env, id, request.user);
  });

  app.post('/animals/:id/health', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const requested = parseId(request.params, 'Esse animal não existe.');
    const input = parse(healthRecordSchema, request.body);
    const animalId = await resolveAnimal(pool, requested);
    if (!animalId) throw new HttpError(404, 'Esse animal não existe.');
    if (!(await isCaretaker(pool, animalId, user))) {
      throw new HttpError(403, 'Só quem cuida do animal registra a saúde dele.');
    }
    const title = stripControls(input.title).trim();
    const notes = input.notes ? stripControls(input.notes).trim() : '';
    if (looksLikeAnimalSale(title) || (notes && looksLikeAnimalSale(notes))) {
      throw new HttpError(400, 'Não é permitido vender animais.');
    }
    if (input.clientKey) {
      const replay = await pool.query<{ id: string }>(
        `SELECT id FROM animal_health_records WHERE recorded_by = $1 AND client_key = $2`,
        [user.id, input.clientKey],
      );
      if (replay.rows[0]) return reply.code(200).send({ id: replay.rows[0].id });
    }
    try {
      const id = await withTransaction(pool, async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO animal_health_records
             (animal_id, kind, title, notes, occurred_on, next_due_on, visibility, recorded_by, client_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            animalId,
            input.kind,
            title,
            notes || null,
            input.occurredOn,
            input.nextDueOn ?? null,
            input.visibility,
            user.id,
            input.clientKey ?? null,
          ],
        );
        await syncCareFlags(client, animalId, input);
        return inserted.rows[0]?.id;
      });
      return reply.code(201).send({ id });
    } catch (error) {
      // Dois envios iguais ao mesmo tempo: o segundo devolve o que o primeiro salvou.
      if (input.clientKey && isUniqueViolation(error)) {
        const replay = await pool.query<{ id: string }>(
          `SELECT id FROM animal_health_records WHERE recorded_by = $1 AND client_key = $2`,
          [user.id, input.clientKey],
        );
        if (replay.rows[0]) return reply.code(200).send({ id: replay.rows[0].id });
      }
      throw error;
    }
  });

  app.delete('/animals/:id/health/:recordId', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = recordParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse registro não existe mais.');
    const animalId = await resolveAnimal(pool, parsed.data.id);
    if (!animalId) throw new HttpError(404, 'Esse registro não existe mais.');
    const removed = await pool.query(
      `UPDATE animal_health_records SET removed_at = now(), removed_by = $3
       WHERE id = $1 AND animal_id = $2 AND removed_at IS NULL
         AND (recorded_by = $3 OR $4::boolean)`,
      [parsed.data.recordId, animalId, user.id, isOperator(user.role)],
    );
    if ((removed.rowCount ?? 0) === 0) {
      throw new HttpError(404, 'Esse registro não existe mais ou não é seu.');
    }
    return { removed: true };
  });

  // "É o mesmo animal daquele post." Quem cuida dos dois junta na hora; senão vira pedido.
  app.post('/animals/:id/links', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const requested = parseId(request.params, 'Esse animal não existe.');
    const input = parse(animalLinkSchema, request.body);
    const animalId = await resolveAnimal(pool, requested);
    if (!animalId) throw new HttpError(404, 'Esse animal não existe.');
    if (!(await isCaretaker(pool, animalId, user))) {
      throw new HttpError(403, 'Só quem cuida do animal pode juntar as ocorrências.');
    }
    const otherPost = await pool.query<{ animal_id: string }>(
      `SELECT animal_id FROM posts
       WHERE id = $1 AND parent_post_id IS NULL AND hidden = false AND review_status = 'published'`,
      [input.postId],
    );
    const otherRaw = otherPost.rows[0]?.animal_id;
    const otherId = otherRaw ? await resolveAnimal(pool, otherRaw) : null;
    if (!otherId) throw new HttpError(404, 'Não achei esse outro post.');
    if (otherId === animalId) throw new HttpError(409, 'Esses posts já são do mesmo animal.');
    await assertSameSpecies(pool, animalId, otherId);
    const reason = stripControls(input.reason).trim();

    if (await isCaretaker(pool, otherId, user)) {
      const [keep, drop] = await orderForMerge(pool, animalId, otherId);
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO animal_links
             (from_animal_id, to_animal_id, requested_by, decided_by, status, reason, decided_at)
           VALUES ($1, $2, $3, $3, 'accepted', $4, now())`,
          [animalId, otherId, user.id, reason],
        );
        await mergeAnimals(client, keep, drop);
      });
      return reply.code(201).send({ status: 'accepted', animalId: keep });
    }

    let linkId: string | undefined;
    try {
      const created = await pool.query<{ id: string }>(
        `INSERT INTO animal_links (from_animal_id, to_animal_id, requested_by, reason)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [animalId, otherId, user.id, reason],
      );
      linkId = created.rows[0]?.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'Já existe um pedido para juntar esses dois. Aguarde a resposta.');
      }
      throw error;
    }
    await notifyPeople(pool, env, await authorsOf(pool, otherId), 'animal_link', {
      title: 'Pode ser o mesmo animal',
      body: `${firstName(user.name)} acha que o seu post é do mesmo animal de outro post. Confira no passaporte e confirme se for.`,
      postId: input.postId,
      route: `/animal/${otherId}`,
    }).catch(bestEffort(request, 'notify:animal-link'));
    return reply.code(201).send({ status: 'pending', id: linkId });
  });

  app.post('/animal-links/:id/:action', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = z
      .object({ id: z.string().uuid(), action: z.enum(['accept', 'reject']) })
      .safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse pedido não existe mais.');
    const { id, action } = parsed.data;
    const result = await withTransaction(pool, async (client) => {
      const found = await client.query<{
        from_animal_id: string;
        to_animal_id: string;
        requested_by: string | null;
      }>(
        `SELECT from_animal_id, to_animal_id, requested_by FROM animal_links
         WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [id],
      );
      const link = found.rows[0];
      if (!link) throw new HttpError(404, 'Esse pedido já foi respondido.');
      if (!(await isCaretaker(client, link.to_animal_id, user))) {
        throw new HttpError(403, 'Só quem cuida deste animal responde ao pedido.');
      }
      await client.query(
        `UPDATE animal_links SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1`,
        [id, action === 'accept' ? 'accepted' : 'rejected', user.id],
      );
      let keep = link.to_animal_id;
      if (action === 'accept') {
        const from = await resolveAnimal(client, link.from_animal_id);
        const to = await resolveAnimal(client, link.to_animal_id);
        if (from && to && from !== to) {
          await assertSameSpecies(client, from, to);
          const [kept, drop] = await orderForMerge(client, from, to);
          await mergeAnimals(client, kept, drop);
          keep = kept;
        }
      }
      return { requestedBy: link.requested_by, keep };
    });
    if (result.requestedBy) {
      await notifyPeople(
        pool,
        env,
        [result.requestedBy],
        'animal_link',
        {
          title: action === 'accept' ? 'Ocorrências juntadas' : 'Pedido para juntar recusado',
          body:
            action === 'accept'
              ? 'Quem cuida confirmou que é o mesmo animal. O passaporte agora reúne tudo.'
              : 'Quem cuida do outro post disse que não é o mesmo animal.',
          route: `/animal/${result.keep}`,
        },
        { push: false },
      ).catch(bestEffort(request, 'notify:animal-link-decision'));
    }
    return { status: action === 'accept' ? 'accepted' : 'rejected', animalId: result.keep };
  });
}
