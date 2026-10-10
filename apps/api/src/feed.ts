import {
  canTransitionStatus,
  looksLikeAnimalSale,
  statusAfterLeavingHelp,
  type AnimalStatus,
  type CreatePostInput,
  type FeedQuery,
  type LeaveHelpOutcome,
  type UpdatePostInput,
} from '@patinha/shared';
import type { Pool, PoolClient } from 'pg';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { assertOwnedMedia, ownedMediaKey } from './mediaPolicy.js';
import { publicMediaUrl } from './media.js';
import { assertHelpRequest, canSeeExactPlace, publicPixKey, publicPlace } from './privacy.js';
import { rowsOf, type SessionUser } from './session.js';
import { stripControls } from './text.js';

interface PostRow {
  id: string;
  type: string;
  urgency: string;
  description: string;
  approx_label: string;
  status: AnimalStatus;
  created_at: Date;
  boosted: boolean;
  urgency_rank: number;
  author_id: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  author_role: string;
  author_verified: boolean;
  author_phone: string | null;
  author_whatsapp: boolean;
  species: string;
  size: string;
  sex: string;
  age_estimate: string | null;
  health_notes: string | null;
  temperament: string | null;
  animal_id: string;
  approx_lat: number;
  approx_lng: number;
  exact_lat: number;
  exact_lng: number;
  accuracy_m: number | null;
  address_text: string | null;
  reference_point: string | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
  viewer_will_help: boolean;
  parent_post_id: string | null;
}

export async function listPosts(
  pool: Pool,
  env: Env,
  query: FeedQuery,
  viewer: SessionUser | null,
) {
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = [
    'p.hidden = false',
    "p.review_status = 'published'",
    'u.deleted_at IS NULL',
    'u.suspended = false',
    'p.parent_post_id IS NULL',
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
  if (query.size) where.push(`a.size = ${add(query.size)}`);
  if (query.urgency) where.push(`p.urgency = ${add(query.urgency)}`);
  if (query.status) where.push(`p.status = ${add(query.status)}`);
  if (query.type) where.push(`p.type = ${add(query.type)}`);
  if (query.authorId) where.push(`p.author_id = ${add(query.authorId)}`);
  if (query.adopted === 'true' && viewer) {
    where.push(
      `p.status = 'adopted' AND (p.author_id = ${add(viewer.id)} OR a.current_owner_id = ${add(viewer.id)})`,
    );
  }
  if (query.saved === 'true') {
    if (!viewer) return { posts: [], nextCursor: null };
    where.push(
      `EXISTS (SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = ${add(viewer.id)})`,
    );
  }
  if (
    query.latitude !== undefined &&
    query.longitude !== undefined &&
    query.radiusKm !== undefined
  ) {
    where.push(
      `ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${add(query.longitude)}, ${add(query.latitude)}), 4326)::geography, ${add(query.radiusKm * 1000)})`,
    );
  }
  if (
    query.west !== undefined &&
    query.south !== undefined &&
    query.east !== undefined &&
    query.north !== undefined
  ) {
    // A ordem do ponto no PostGIS é longitude, latitude.
    where.push(
      `ST_Intersects(p.location, ST_MakeEnvelope(${add(query.west)}, ${add(query.south)}, ${add(query.east)}, ${add(query.north)}, 4326)::geography)`,
    );
  }
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      const rank = add(cursor.rank);
      const boosted = add(cursor.boosted);
      const createdAt = add(cursor.createdAt);
      const id = add(cursor.id);
      const urgencyRank = `CASE p.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;
      where.push(`(
        ${urgencyRank} > ${rank}
        OR (${urgencyRank} = ${rank} AND p.boosted < ${boosted})
        OR (${urgencyRank} = ${rank} AND p.boosted = ${boosted} AND p.created_at < ${createdAt})
        OR (${urgencyRank} = ${rank} AND p.boosted = ${boosted} AND p.created_at = ${createdAt} AND p.id < ${id})
      )`);
    }
  }
  const viewerId = add(viewer?.id ?? null);
  const limit = add(query.limit + 1);
  const result = await pool.query(
    `SELECT ${postColumns(viewerId)}
     FROM posts p
     JOIN users u ON u.id = p.author_id
     JOIN animals a ON a.id = p.animal_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE p.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
              p.boosted DESC,
              p.created_at DESC,
              p.id DESC
     LIMIT ${limit}`,
    params,
  );
  const rows = rowsOf<PostRow>(result);
  const page = rows.slice(0, query.limit);
  const posts = await hydrate(pool, env, page, viewer);
  const last = page.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor(last.urgency_rank, last.boosted, last.created_at.toISOString(), last.id)
      : null;
  return { posts, nextCursor };
}

export async function getPost(pool: Pool, env: Env, id: string, viewer: SessionUser | null) {
  const result = await pool.query(
    `SELECT ${postColumns('$2')}
     FROM posts p
     JOIN users u ON u.id = p.author_id
     JOIN animals a ON a.id = p.animal_id
     WHERE p.id = $1 AND p.hidden = false AND p.review_status = 'published'`,
    [id, viewer?.id ?? null],
  );
  const row = rowsOf<PostRow>(result)[0];
  if (!row) throw new HttpError(404, 'Esse alerta não existe.');
  const [post] = await hydrate(pool, env, [row], viewer);
  if (!post) throw new HttpError(404, 'Esse alerta não existe.');
  const updates = await pool.query(
    `SELECT p.id, p.description, p.status, p.created_at, u.name, u.handle
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.parent_post_id = $1 AND p.hidden = false AND p.review_status = 'published'
     ORDER BY p.created_at ASC`,
    [id],
  );
  return {
    ...post,
    updates: rowsOf<{
      id: string;
      description: string;
      status: string;
      created_at: Date;
      name: string;
      handle: string;
    }>(updates).map((update) => ({
      id: update.id,
      description: update.description,
      status: update.status,
      createdAt: update.created_at.toISOString(),
      author: { name: update.name, handle: update.handle },
    })),
  };
}

export async function createPost(pool: Pool, env: Env, user: SessionUser, input: CreatePostInput) {
  if (input.parentPostId) return addDiaryNote(pool, user, input);
  assertHelpRequest(user, input);
  assertOwnedMedia(
    user.id,
    input.media.map((item) => item.url),
  );
  const description = stripControls(input.description);
  const reviewStatus = looksLikeAnimalSale(description) ? 'pending' : 'published';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const animal = await client.query<{ id: string }>(
      `INSERT INTO animals (species, size, sex, age_estimate, health_notes, temperament, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING id`,
      [
        input.species,
        input.size,
        input.sex ?? 'unknown',
        input.ageEstimate ?? null,
        input.healthNotes ?? null,
        input.temperament ?? null,
      ],
    );
    const animalId = animal.rows[0]?.id;
    if (!animalId) throw new HttpError(500, 'Não consegui salvar o animal.');
    const post = await client.query<{ id: string }>(
      `INSERT INTO posts (
         author_id, animal_id, type, urgency, description, location, approx_label, status, parent_post_id, review_status,
         accuracy_m, address_text, reference_point
       ) VALUES (
         $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $8, 'open', $9, $10,
         $11, $12, $13
       ) RETURNING id`,
      [
        user.id,
        animalId,
        input.type,
        input.urgency,
        description,
        input.longitude,
        input.latitude,
        input.approxLabel,
        input.parentPostId ?? null,
        reviewStatus,
        input.accuracyM ?? null,
        input.addressText ?? null,
        input.referencePoint ?? null,
      ],
    );
    const postId = post.rows[0]?.id;
    if (!postId) throw new HttpError(500, 'Não consegui salvar o alerta.');
    for (const [position, media] of input.media.entries()) {
      await client.query(
        `INSERT INTO post_media (post_id, url, type, position) VALUES ($1, $2, 'image', $3)`,
        [postId, media.url, position],
      );
    }
    if (input.helpRequest) {
      await client.query(
        `INSERT INTO help_requests (post_id, kind, goal_amount, pix_key, deadline)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          postId,
          input.helpRequest.kind,
          input.helpRequest.goalAmount ?? null,
          input.helpRequest.pixKey ?? null,
          input.helpRequest.deadline ?? null,
        ],
      );
    }
    await client.query('COMMIT');
    return { id: postId, reviewStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function changeStatus(
  pool: Pool,
  postId: string,
  user: SessionUser,
  status: AnimalStatus,
) {
  const current = await pool.query<{
    status: AnimalStatus;
    author_id: string;
    animal_id: string;
    longitude: number;
    latitude: number;
  }>(
    `SELECT status, author_id, animal_id, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude
     FROM posts WHERE id = $1`,
    [postId],
  );
  const post = current.rows[0];
  if (!post) throw new HttpError(404, 'Esse alerta não existe.');
  const allowed = await canChange(pool, post.author_id, postId, user);
  if (!allowed) throw new HttpError(403, 'Você não pode atualizar esse alerta.');
  if (!canTransitionStatus(post.status, status)) {
    throw new HttpError(400, 'Essa mudança de status não é permitida.');
  }
  await applyStatus(pool, postId, user.id, post.animal_id, status);
}

async function applyStatus(
  db: Pool | PoolClient,
  postId: string,
  userId: string,
  animalId: string,
  status: AnimalStatus,
) {
  await db.query('UPDATE posts SET status = $2 WHERE id = $1', [postId, status]);
  await db.query(
    "UPDATE animals SET status = $2, current_owner_id = CASE WHEN $2 = 'adopted' THEN $3 ELSE current_owner_id END WHERE id = $1",
    [animalId, status, userId],
  );
  await db.query(
    `INSERT INTO posts (author_id, animal_id, type, urgency, description, location, approx_label, status, parent_post_id)
     SELECT $2, animal_id, 'update', urgency, $3, location, approx_label, $4, id
     FROM posts WHERE id = $1`,
    [postId, userId, statusLabel(status), status],
  );
}

export async function updatePost(
  pool: Pool,
  postId: string,
  user: SessionUser,
  input: UpdatePostInput,
  verifyFreshMedia: (urls: string[]) => Promise<void>,
) {
  const current = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM posts
     WHERE id = $1 AND parent_post_id IS NULL AND hidden = false`,
    [postId],
  );
  const post = current.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe.');
  if (user.id !== post.author_id && user.role !== 'admin') {
    throw new HttpError(403, 'Só quem publicou pode editar esse resgate.');
  }
  const description = stripControls(input.description.trim());
  if (looksLikeAnimalSale(description)) {
    throw new HttpError(400, 'Não é permitido vender animais.');
  }
  const stored = await pool.query<{ url: string }>(
    `SELECT url FROM post_media WHERE post_id = $1`,
    [postId],
  );
  const existing = new Set(stored.rows.map((row) => row.url));
  const urls = input.media.map((item) => item.url);
  const fresh = urls.filter((url) => !existing.has(url));
  for (const url of urls) {
    if (!existing.has(url) && !ownedMediaKey(user.id, url)) {
      throw new HttpError(400, 'A foto precisa ser um envio da sua conta.');
    }
  }
  assertOwnedMedia(user.id, fresh);
  await verifyFreshMedia(fresh);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE posts SET description = $2, urgency = $3 WHERE id = $1`, [
      postId,
      description,
      input.urgency,
    ]);
    await client.query(`DELETE FROM post_media WHERE post_id = $1`, [postId]);
    for (const [position, url] of urls.entries()) {
      await client.query(
        `INSERT INTO post_media (post_id, url, type, position) VALUES ($1, $2, 'image', $3)`,
        [postId, url, position],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePost(pool: Pool, postId: string, user: SessionUser) {
  const current = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM posts
     WHERE id = $1 AND parent_post_id IS NULL AND hidden = false`,
    [postId],
  );
  const post = current.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe.');
  if (user.id !== post.author_id && user.role !== 'admin') {
    throw new HttpError(403, 'Só quem publicou pode excluir esse resgate.');
  }
  await pool.query(`UPDATE posts SET hidden = true WHERE id = $1 OR parent_post_id = $1`, [postId]);
}

export async function leaveHelp(
  pool: Pool,
  postId: string,
  user: SessionUser,
  outcome: LeaveHelpOutcome,
): Promise<{ status: AnimalStatus; changed: boolean; noted: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{ status: AnimalStatus; animal_id: string }>(
      `SELECT status, animal_id FROM posts
       WHERE id = $1 AND parent_post_id IS NULL AND hidden = false
       FOR UPDATE`,
      [postId],
    );
    const post = current.rows[0];
    if (!post) throw new HttpError(404, 'Esse resgate não existe.');
    const mine = await client.query(
      `DELETE FROM responses
       WHERE post_id = $1 AND user_id = $2 AND kind = 'will_help'
       RETURNING id`,
      [postId, user.id],
    );
    if ((mine.rowCount ?? 0) === 0) {
      throw new HttpError(403, 'Você não está neste resgate.');
    }
    const left = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM responses WHERE post_id = $1 AND kind = 'will_help'`,
      [postId],
    );
    const remaining = left.rows[0]?.count ?? 0;
    const next = statusAfterLeavingHelp(post.status, outcome, remaining);
    if (next) {
      if (!canTransitionStatus(post.status, next)) {
        throw new HttpError(400, 'Essa mudança de status não é permitida.');
      }
      await applyStatus(client, postId, user.id, post.animal_id, next);
      await client.query('COMMIT');
      return { status: next, changed: true, noted: false };
    }
    let noted = false;
    if (outcome === 'not_found') {
      await client.query(
        `INSERT INTO posts (
           author_id, animal_id, type, urgency, description, location, approx_label, status, parent_post_id
         )
         SELECT $2, animal_id, 'update', 'low', $3, location, approx_label, status, id
         FROM posts WHERE id = $1`,
        [postId, user.id, 'Não encontrei o animal.'],
      );
      noted = true;
    }
    await client.query('COMMIT');
    return { status: post.status, changed: false, noted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function addResponse(
  pool: Pool,
  postId: string,
  user: SessionUser,
  kind: 'will_help' | 'seen' | 'has_foster' | 'can_donate',
  note?: string,
) {
  try {
    await pool.query(
      `INSERT INTO responses (post_id, user_id, kind, note) VALUES ($1, $2, $3, $4)`,
      [postId, user.id, kind, note ?? null],
    );
  } catch (error) {
    if (isUnique(error)) throw new HttpError(409, 'Você já respondeu esse alerta desse jeito.');
    throw error;
  }
  if (kind === 'will_help') {
    const current = await pool.query<{ status: AnimalStatus }>(
      `SELECT status FROM posts WHERE id = $1`,
      [postId],
    );
    const status = current.rows[0]?.status;
    if (status === 'open' || status === 'not_found') {
      await changeStatus(pool, postId, user, 'on_the_way');
    }
  }
}

function postColumns(viewerParam: string): string {
  return `
    p.id, p.type, p.urgency, p.description, p.approx_label, p.status, p.created_at, p.boosted, p.parent_post_id,
    CASE p.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END AS urgency_rank,
    u.id AS author_id, u.name AS author_name, u.handle AS author_handle, u.avatar_url AS author_avatar,
    u.role AS author_role, u.verified AS author_verified, u.phone AS author_phone, u.whatsapp_opt_in AS author_whatsapp,
    a.id AS animal_id, a.species, a.size, a.sex, a.age_estimate, a.health_notes, a.temperament,
    ST_Y(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lat,
    ST_X(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lng,
    ST_Y(p.location::geometry) AS exact_lat,
    ST_X(p.location::geometry) AS exact_lng,
    p.accuracy_m, p.address_text, p.reference_point,
    (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) AS like_count,
    (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id AND c.hidden = false) AS comment_count,
    EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ${viewerParam}) AS liked,
    EXISTS (SELECT 1 FROM saves s WHERE s.post_id = p.id AND s.user_id = ${viewerParam}) AS saved,
    EXISTS (SELECT 1 FROM responses r WHERE r.post_id = p.id AND r.user_id = ${viewerParam} AND r.kind = 'will_help') AS viewer_will_help
  `;
}

async function hydrate(pool: Pool, env: Env, rows: PostRow[], viewer: SessionUser | null) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const media = await pool.query<{ post_id: string; url: string; position: number }>(
    `SELECT post_id, url, position FROM post_media WHERE post_id = ANY($1::uuid[]) ORDER BY position`,
    [ids],
  );
  const help = await pool.query<{
    post_id: string;
    kind: string;
    goal_amount: string | null;
    pix_key: string | null;
    deadline: Date | null;
  }>(
    `SELECT post_id, kind, goal_amount, pix_key, deadline FROM help_requests WHERE post_id = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((row) => {
    const exact = canSeeExactPlace(viewer, row.author_id, row.viewer_will_help);
    const contact = exact && row.author_whatsapp;
    const place = publicPlace(exact, {
      accuracyM: row.accuracy_m,
      addressText: row.address_text,
      referencePoint: row.reference_point,
    });
    const helpRow = help.rows.find((item) => item.post_id === row.id);
    return {
      id: row.id,
      type: row.type,
      urgency: row.urgency,
      description: row.description,
      approxLabel: row.approx_label,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      boosted: row.boosted,
      author: {
        id: row.author_id,
        name: row.author_name,
        handle: row.author_handle,
        avatarUrl: row.author_avatar,
        role: row.author_role,
        verified: row.author_verified,
        phone: contact ? row.author_phone : null,
      },
      animal: {
        id: row.animal_id,
        species: row.species,
        size: row.size,
        sex: row.sex,
        ageEstimate: row.age_estimate,
        healthNotes: row.health_notes,
        temperament: row.temperament,
      },
      location: exact
        ? { latitude: row.exact_lat, longitude: row.exact_lng, exact: true }
        : { latitude: row.approx_lat, longitude: row.approx_lng, exact: false },
      accuracyM: place.accuracyM,
      addressText: place.addressText,
      referencePoint: place.referencePoint,
      media: media.rows
        .filter((item) => item.post_id === row.id)
        .map((item) => ({
          url: publicMediaUrl(env, item.url, 'full'),
          thumbUrl: publicMediaUrl(env, item.url, 'thumb'),
          storageKey:
            viewer && (viewer.id === row.author_id || viewer.role === 'admin') ? item.url : null,
        })),
      counts: { likes: row.like_count, comments: row.comment_count },
      liked: row.liked,
      saved: row.saved,
      viewerWillHelp: row.viewer_will_help,
      helpRequest: helpRow
        ? {
            kind: helpRow.kind,
            goalAmount: helpRow.goal_amount,
            pixKey: publicPixKey(row.author_verified, helpRow.pix_key),
            deadline: helpRow.deadline?.toISOString() ?? null,
            paymentNotice:
              'O app não intermedia pagamento. O Pix é só um dado do perfil verificado.',
          }
        : null,
    };
  });
}

async function canChange(
  pool: Pool,
  authorId: string,
  postId: string,
  user: SessionUser,
): Promise<boolean> {
  if (user.role === 'admin' || user.id === authorId) return true;
  const help = await pool.query(
    `SELECT 1 FROM responses WHERE post_id = $1 AND user_id = $2 AND kind = 'will_help'`,
    [postId, user.id],
  );
  return help.rowCount !== null && help.rowCount > 0;
}

async function addDiaryNote(
  pool: Pool,
  user: SessionUser,
  input: CreatePostInput,
): Promise<{ id: string; reviewStatus: string }> {
  const parentId = input.parentPostId;
  if (!parentId) throw new HttpError(400, 'Falta o resgate deste diário.');
  const parent = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM posts
     WHERE id = $1 AND parent_post_id IS NULL AND hidden = false`,
    [parentId],
  );
  const row = parent.rows[0];
  if (!row) throw new HttpError(404, 'Esse resgate não existe.');
  const allowed = await canChange(pool, row.author_id, parentId, user);
  if (!allowed) {
    throw new HttpError(403, 'Só quem publicou ou quem vai ajudar escreve no diário.');
  }
  const description = stripControls(input.description.trim());
  const reviewStatus = looksLikeAnimalSale(description) ? 'pending' : 'published';
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO posts (
       author_id, animal_id, type, urgency, description, location, approx_label, status, parent_post_id, review_status
     )
     SELECT $2, animal_id, 'update', 'low', $3, location, approx_label, status, id, $4
     FROM posts WHERE id = $1
     RETURNING id`,
    [parentId, user.id, description, reviewStatus],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new HttpError(500, 'Não consegui salvar o diário.');
  return { id, reviewStatus };
}

function statusLabel(status: AnimalStatus): string {
  const labels: Record<AnimalStatus, string> = {
    open: 'Resgate aberto.',
    on_the_way: 'Alguém está a caminho.',
    not_found: 'Não encontrei o animal.',
    rescued: 'Animal resgatado.',
    fostered: 'Foi para um lar temporário.',
    for_adoption: 'Disponível para adoção.',
    adopted: 'Foi adotado.',
  };
  return labels[status];
}

function encodeCursor(rank: number, boosted: boolean, createdAt: string, id: string): string {
  return Buffer.from(`${rank}|${boosted ? 1 : 0}|${createdAt}|${id}`).toString('base64url');
}

function decodeCursor(
  cursor: string,
): { rank: number; boosted: boolean; createdAt: string; id: string } | null {
  const [rank, boosted, createdAt, id] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  if (!rank || !createdAt || !id || !boosted) return null;
  return { rank: Number(rank), boosted: boosted === '1', createdAt, id };
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
