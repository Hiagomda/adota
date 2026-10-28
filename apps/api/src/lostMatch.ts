import { createHmac } from 'node:crypto';
import {
  MATCH_MAX_DISTANCE_KM,
  MATCH_NOTIFY_SCORE,
  MATCH_SUGGEST_SCORE,
  PHOTO_PALETTE_BINS,
  animalColorLabel,
  colorsOf,
  lostSearchSchema,
  matchDecisionSchema,
  matchStrength,
  paletteFromPixels,
  scoreLostMatch,
  type AnimalColor,
  type MatchAnimal,
  type MatchReason,
} from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import QRCode from 'qrcode';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyPeople } from './notify.js';

type RouteLimit = { config: object };

/** Animais encontrados: alerta de resgate (achado na rua) e adoção (alguém está com ele). */
const FOUND_TYPES = ['rescue_alert', 'adoption'];
/** Prefiltro pelo ponto do post, antes de olhar os avistamentos. */
const PREFILTER_METERS = 30_000;
const CANDIDATES_LIMIT = 300;
const LIST_LIMIT = 20;
/** No máximo tantos avisos de sugestão por perdido por dia, para não virar barulho. */
const NOTIFY_PER_DAY = 3;
/** Quem só busca, sem publicar, vê sugestões a partir dessa nota (tem menos dados). */
const SEARCH_MIN_SCORE = 40;
const PALETTE_TIMEOUT_MS = 5000;
const POSTER_PHOTO_TIMEOUT_MS = 5000;
const POSTER_PHOTO_MAX_BYTES = 1_500_000;

const idParams = z.object({ id: z.string().uuid() });
const decisionParams = z.object({ id: z.string().uuid(), decision: matchDecisionSchema });

function parseId(params: unknown, message: string): string {
  const parsed = idParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, message);
  return parsed.data.id;
}

interface PairRow {
  lost_id: string;
  lost_author_id: string;
  lost_created_at: Date;
  lost_species: MatchAnimal['species'];
  lost_size: MatchAnimal['size'];
  lost_sex: MatchAnimal['sex'];
  lost_colors: AnimalColor[];
  lost_text: string;
  lost_palette: number[] | null;
  found_id: string;
  found_author_id: string;
  found_species: MatchAnimal['species'];
  found_size: MatchAnimal['size'];
  found_sex: MatchAnimal['sex'];
  found_colors: AnimalColor[];
  found_text: string;
  found_palette: number[] | null;
  found_seen_at: Date;
  distance_m: number;
}

/** Pontos onde o animal esteve: o do post e os avistamentos. */
const pointsOf = (alias: string) => `
  SELECT ${alias}.location AS location
  UNION ALL
  SELECT s.location FROM sightings s WHERE s.post_id = ${alias}.id`;

const animalText = (post: string, animal: string) =>
  `concat_ws(' ', ${animal}.name, ${post}.description, ${animal}.temperament)`;

/**
 * Pares perdido × encontrado ainda possíveis, com um dos lados fixo. A distância é a menor
 * entre qualquer ponto do perdido e qualquer ponto do encontrado (post ou avistamento).
 */
async function candidatePairs(
  pool: Pool,
  side: { lostPostId: string } | { foundPostId: string },
): Promise<PairRow[]> {
  const lostId = 'lostPostId' in side ? side.lostPostId : null;
  const foundId = 'foundPostId' in side ? side.foundPostId : null;
  const result = await pool.query<PairRow>(
    `WITH lost AS (
       SELECT p.id, p.author_id, p.animal_id, p.created_at, p.location,
              a.species, a.size, a.sex, a.colors, ${animalText('p', 'a')} AS text
       FROM posts p
       JOIN animals a ON a.id = p.animal_id
       JOIN users u ON u.id = p.author_id
       WHERE p.type = 'lost' AND p.status = 'open' AND p.parent_post_id IS NULL
         AND p.hidden = false AND p.review_status = 'published' AND u.deleted_at IS NULL
         AND ($1::uuid IS NULL OR p.id = $1)
     ),
     found AS (
       SELECT p.id, p.author_id, p.animal_id, p.created_at, p.location,
              a.species, a.size, a.sex, a.colors, ${animalText('p', 'a')} AS text,
              GREATEST(
                p.created_at,
                (SELECT max(s.created_at) FROM sightings s WHERE s.post_id = p.id)
              ) AS seen_at
       FROM posts p
       JOIN animals a ON a.id = p.animal_id
       JOIN users u ON u.id = p.author_id
       WHERE p.type = ANY($3::text[]) AND p.parent_post_id IS NULL
         AND p.hidden = false AND p.review_status = 'published' AND u.deleted_at IS NULL
         AND ($2::uuid IS NULL OR p.id = $2)
     )
     SELECT l.id AS lost_id, l.author_id AS lost_author_id, l.created_at AS lost_created_at,
            l.species AS lost_species, l.size AS lost_size, l.sex AS lost_sex,
            l.colors AS lost_colors, l.text AS lost_text, lp.palette AS lost_palette,
            f.id AS found_id, f.author_id AS found_author_id,
            f.species AS found_species, f.size AS found_size, f.sex AS found_sex,
            f.colors AS found_colors, f.text AS found_text, fp.palette AS found_palette,
            f.seen_at AS found_seen_at, d.meters AS distance_m
     FROM lost l
     JOIN found f
       ON f.species = l.species
      AND f.author_id <> l.author_id
      AND f.animal_id <> l.animal_id
      AND f.seen_at > l.created_at - interval '2 days'
      AND f.created_at < l.created_at + interval '120 days'
      AND ST_DWithin(f.location, l.location, ${PREFILTER_METERS})
     CROSS JOIN LATERAL (
       SELECT min(ST_Distance(a.location, b.location)) AS meters
       FROM (${pointsOf('l')}) a, (${pointsOf('f')}) b
     ) d
     LEFT JOIN post_photo_palettes lp ON lp.post_id = l.id
     LEFT JOIN post_photo_palettes fp ON fp.post_id = f.id
     WHERE d.meters <= $4
     ORDER BY d.meters
     LIMIT ${CANDIDATES_LIMIT}`,
    [lostId, foundId, FOUND_TYPES, MATCH_MAX_DISTANCE_KM * 1000],
  );
  return result.rows;
}

function sideOf(
  row: PairRow,
  prefix: 'lost' | 'found',
): Omit<MatchAnimal, 'palette'> & { palette: number[] | null } {
  return {
    species: row[`${prefix}_species`],
    size: row[`${prefix}_size`],
    sex: row[`${prefix}_sex`],
    colors: row[`${prefix}_colors`] ?? [],
    text: row[`${prefix}_text`] ?? '',
    palette: row[`${prefix}_palette`],
  };
}

/** Distância para mostrar: meio quilômetro de precisão; abaixo de 1 km vira 0,5 ("menos de 1 km"). */
function shownKm(meters: number): number {
  return meters < 1000 ? 0.5 : Math.round(meters / 500) / 2;
}

/**
 * Recalcula as sugestões em que um post entra (como perdido ou como encontrado), grava as que
 * passam da nota e avisa quem publicou as novas fortes. Devolve quantas sugestões o post tem.
 */
export async function refreshMatchesForPost(pool: Pool, env: Env, postId: string): Promise<number> {
  const post = await pool.query<{ type: string; parent_post_id: string | null }>(
    `SELECT type, parent_post_id FROM posts WHERE id = $1`,
    [postId],
  );
  const row = post.rows[0];
  if (!row || row.parent_post_id) return 0;
  const isLost = row.type === 'lost';
  if (!isLost && !FOUND_TYPES.includes(row.type)) return 0;
  const pairs = await candidatePairs(
    pool,
    isLost ? { lostPostId: postId } : { foundPostId: postId },
  );
  let kept = 0;
  const fresh: { id: string; lostId: string; foundId: string }[] = [];
  for (const pair of pairs) {
    const result = scoreLostMatch(sideOf(pair, 'lost'), sideOf(pair, 'found'), {
      distanceKm: pair.distance_m / 1000,
      lostAt: pair.lost_created_at,
      seenAt: pair.found_seen_at,
    });
    if (!result) continue;
    if (result.score < MATCH_SUGGEST_SCORE) {
      // Caiu abaixo da nota (ex.: o tutor corrigiu as cores): some, a menos que alguém já decidiu.
      await pool.query(
        `DELETE FROM lost_matches
         WHERE lost_post_id = $1 AND found_post_id = $2 AND status = 'suggested'`,
        [pair.lost_id, pair.found_id],
      );
      continue;
    }
    kept += 1;
    const saved = await pool.query<{ id: string; notified_at: Date | null; status: string }>(
      `INSERT INTO lost_matches (lost_post_id, found_post_id, score, reasons, distance_km)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (lost_post_id, found_post_id) DO UPDATE
         SET score = EXCLUDED.score, reasons = EXCLUDED.reasons,
             distance_km = EXCLUDED.distance_km, updated_at = now()
       RETURNING id, notified_at, status`,
      [
        pair.lost_id,
        pair.found_id,
        result.score,
        JSON.stringify(result.reasons),
        shownKm(pair.distance_m),
      ],
    );
    const match = saved.rows[0];
    if (
      match &&
      match.status === 'suggested' &&
      match.notified_at === null &&
      result.score >= MATCH_NOTIFY_SCORE
    ) {
      fresh.push({ id: match.id, lostId: pair.lost_id, foundId: pair.found_id });
    }
  }
  for (const match of fresh) await notifyMatch(pool, env, match);
  return kept;
}

/**
 * Avisa o tutor do perdido e quem publicou o encontrado. O UPDATE marca antes de avisar, então
 * duas contas ao mesmo tempo não mandam o mesmo aviso duas vezes.
 */
async function notifyMatch(
  pool: Pool,
  env: Env,
  match: { id: string; lostId: string; foundId: string },
): Promise<void> {
  const claimed = await pool.query<{ lost_author: string; found_author: string; label: string }>(
    `UPDATE lost_matches m SET notified_at = now()
     FROM posts l, posts f
     WHERE m.id = $1 AND m.notified_at IS NULL
       AND l.id = m.lost_post_id AND f.id = m.found_post_id
       AND (
         SELECT count(*) FROM lost_matches o
         WHERE o.lost_post_id = m.lost_post_id AND o.notified_at > now() - interval '1 day'
       ) < $2
     RETURNING l.author_id AS lost_author, f.author_id AS found_author, f.approx_label AS label`,
    [match.id, NOTIFY_PER_DAY],
  );
  const row = claimed.rows[0];
  if (!row) return;
  await notifyPeople(pool, env, [row.lost_author], 'lost_match', {
    title: 'Pode ser o seu animal',
    body: `Um animal parecido apareceu em ${row.label}. Veja as fotos e confira se é ele.`,
    postId: match.lostId,
    route: `/lost-matches/${match.lostId}`,
  });
  await notifyPeople(
    pool,
    env,
    [row.found_author],
    'lost_match',
    {
      title: 'Alguém pode estar procurando este animal',
      body: 'Um animal perdido parecido foi publicado perto de onde você o viu. Veja a sugestão.',
      postId: match.foundId,
      route: `/lost-matches/${match.foundId}`,
    },
    // Quem encontrou recebe só na tela Alertas: o tutor é quem confirma.
    { push: false },
  );
}

/** Lê uma miniatura BMP de 24 ou 32 bits e devolve os pontos em RGB. */
export function bmpPixels(buffer: Uint8Array): number[] {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.length < 54 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
    throw new Error('not a BMP');
  }
  const offset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const height = Math.abs(view.getInt32(22, true));
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  // 32 bits do imgproxy vem com máscaras (compressão 3), mas a ordem continua BGRA.
  if ((bits !== 24 && bits !== 32) || (compression !== 0 && compression !== 3)) {
    throw new Error(`unsupported BMP ${bits}/${compression}`);
  }
  if (width <= 0 || width > 64 || height <= 0 || height > 64) throw new Error('BMP too big');
  const step = bits / 8;
  const rowSize = Math.ceil((width * step) / 4) * 4;
  const rgb: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = offset + y * rowSize + x * step;
      if (at + 2 >= buffer.length) throw new Error('BMP truncated');
      rgb.push(buffer[at + 2] ?? 0, buffer[at + 1] ?? 0, buffer[at] ?? 0);
    }
  }
  return rgb;
}

/** Endereço assinado do imgproxy para uma versão processada de uma foto guardada. */
function imgproxyUrl(env: Env, stored: string, processing: string): string {
  const source = Buffer.from(`s3://${env.MINIO_BUCKET}/${stored}`).toString('base64url');
  const path = `/${processing}/${source}`;
  let signature = 'insecure';
  if (env.IMGPROXY_KEY && env.IMGPROXY_SALT) {
    const hmac = createHmac('sha256', Buffer.from(env.IMGPROXY_KEY, 'hex'));
    hmac.update(Buffer.from(env.IMGPROXY_SALT, 'hex'));
    hmac.update(path);
    signature = hmac.digest('base64url');
  }
  return `${env.IMGPROXY_URL.replace(/\/$/, '')}/${signature}${path}`;
}

async function fetchBytes(url: string, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`imgproxy ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('image too big');
  return bytes;
}

/**
 * Paleta da primeira foto do post: o centro da foto (onde o animal costuma estar) reduzido a
 * 8×8 pontos pelo próprio imgproxy, sem serviço pago nem biblioteca nova. Não reconhece o
 * animal, só compara os tons. Devolve false quando não há foto que dê para ler.
 */
export async function refreshPhotoPalette(pool: Pool, env: Env, postId: string): Promise<boolean> {
  const media = await pool.query<{ url: string }>(
    `SELECT url FROM post_media WHERE post_id = $1 ORDER BY position LIMIT 1`,
    [postId],
  );
  const stored = media.rows[0]?.url;
  if (!stored || stored.startsWith('http://') || stored.startsWith('https://')) {
    await pool.query(`DELETE FROM post_photo_palettes WHERE post_id = $1`, [postId]);
    return false;
  }
  const current = await pool.query<{ media_url: string }>(
    `SELECT media_url FROM post_photo_palettes WHERE post_id = $1`,
    [postId],
  );
  if (current.rows[0]?.media_url === stored) return true;
  const bytes = await fetchBytes(
    imgproxyUrl(env, stored, 'c:0.6:0.6/rs:force:8:8/f:bmp'),
    PALETTE_TIMEOUT_MS,
    16_384,
  );
  const palette = paletteFromPixels(bmpPixels(bytes));
  if (palette.length !== PHOTO_PALETTE_BINS) return false;
  await pool.query(
    `INSERT INTO post_photo_palettes (post_id, media_url, palette) VALUES ($1, $2, $3)
     ON CONFLICT (post_id) DO UPDATE
       SET media_url = EXCLUDED.media_url, palette = EXCLUDED.palette, computed_at = now()`,
    [postId, stored, palette],
  );
  return true;
}

/** Paleta (melhor esforço, com log) e depois as sugestões. É o que o worker roda. */
export async function processPostForMatches(
  pool: Pool,
  env: Env,
  postId: string,
  log: (error: unknown, where: string) => void,
): Promise<number> {
  if (env.NODE_ENV !== 'test') {
    await refreshPhotoPalette(pool, env, postId).catch((error: unknown) =>
      log(error, 'lost-match:palette'),
    );
  }
  return refreshMatchesForPost(pool, env, postId);
}

interface MatchRow {
  id: string;
  score: number;
  reasons: MatchReason[];
  distance_km: number;
  status: string;
  created_at: Date;
  other_id: string;
  other_type: string;
  other_status: string;
  other_label: string;
  other_created_at: Date;
  other_species: string;
  other_size: string;
  other_sex: string | null;
  other_name: string | null;
  other_colors: AnimalColor[];
  other_description: string;
  other_animal_id: string;
  other_author_name: string;
  other_author_handle: string;
  other_photo: string | null;
}

function matchView(env: Env, row: MatchRow) {
  return {
    id: row.id,
    score: row.score,
    strength: matchStrength(row.score),
    reasons: row.reasons,
    distanceKm: row.distance_km,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    post: {
      id: row.other_id,
      type: row.other_type,
      status: row.other_status,
      approxLabel: row.other_label,
      createdAt: row.other_created_at.toISOString(),
      description: row.other_description.slice(0, 280),
      animal: {
        id: row.other_animal_id,
        species: row.other_species,
        size: row.other_size,
        sex: row.other_sex,
        name: row.other_name,
        colors: row.other_colors ?? [],
      },
      author: { name: row.other_author_name, handle: row.other_author_handle },
      photo: row.other_photo
        ? {
            url: publicMediaUrl(env, row.other_photo, 'full'),
            thumbUrl: publicMediaUrl(env, row.other_photo, 'thumb'),
          }
        : null,
    },
  };
}

/** Colunas do "outro lado" da sugestão. Só dados que já são públicos no feed. */
const otherColumns = (alias: string) => `
  m.id, m.score, m.reasons, m.distance_km, m.status, m.created_at,
  ${alias}.id AS other_id, ${alias}.type AS other_type, ${alias}.status AS other_status,
  ${alias}.approx_label AS other_label, ${alias}.created_at AS other_created_at,
  ${alias}.description AS other_description,
  a.id AS other_animal_id, a.species AS other_species, a.size AS other_size, a.sex AS other_sex,
  a.name AS other_name, a.colors AS other_colors,
  u.name AS other_author_name, u.handle AS other_author_handle,
  (SELECT pm.url FROM post_media pm WHERE pm.post_id = ${alias}.id ORDER BY pm.position LIMIT 1)
    AS other_photo`;

async function postGate(pool: Pool, postId: string) {
  const found = await pool.query<{
    author_id: string;
    type: string;
    status: string;
    parent_post_id: string | null;
  }>(`SELECT author_id, type, status, parent_post_id FROM posts WHERE id = $1 AND hidden = false`, [
    postId,
  ]);
  const row = found.rows[0];
  if (!row || row.parent_post_id) throw new HttpError(404, 'Esse post não existe mais.');
  return row;
}

async function listMatches(pool: Pool, env: Env, postId: string, type: string) {
  if (type === 'lost') {
    const result = await pool.query<MatchRow>(
      `SELECT ${otherColumns('f')}
       FROM lost_matches m
       JOIN posts f ON f.id = m.found_post_id
       JOIN animals a ON a.id = f.animal_id
       JOIN users u ON u.id = f.author_id
       WHERE m.lost_post_id = $1 AND m.status <> 'dismissed'
         AND f.hidden = false AND u.deleted_at IS NULL
       ORDER BY (m.status = 'confirmed') DESC, m.score DESC, m.created_at DESC
       LIMIT ${LIST_LIMIT}`,
      [postId],
    );
    return result.rows.map((row) => matchView(env, row));
  }
  const result = await pool.query<MatchRow>(
    `SELECT ${otherColumns('l')}
     FROM lost_matches m
     JOIN posts l ON l.id = m.lost_post_id
     JOIN animals a ON a.id = l.animal_id
     JOIN users u ON u.id = l.author_id
     WHERE m.found_post_id = $1 AND m.status <> 'dismissed'
       AND l.hidden = false AND l.status = 'open' AND u.deleted_at IS NULL
     ORDER BY (m.status = 'confirmed') DESC, m.score DESC, m.created_at DESC
     LIMIT ${LIST_LIMIT}`,
    [postId],
  );
  return result.rows.map((row) => matchView(env, row));
}

function belemDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Belem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const speciesName: Record<string, string> = { dog: 'Cachorro', cat: 'Gato', other: 'Animal' };
const sizeName: Record<string, string> = { small: 'pequeno', medium: 'médio', large: 'grande' };
const sexName: Record<string, string> = { male: 'macho', female: 'fêmea' };

/** Foto do cartaz embutida na página: o cartaz abre por HTTPS e o imgproxy é HTTP. */
async function posterPhoto(env: Env, stored: string | undefined): Promise<string | null> {
  if (!stored) return null;
  const url =
    stored.startsWith('http://') || stored.startsWith('https://')
      ? stored
      : imgproxyUrl(env, stored, 'rs:fit:900:900/q:80/f:jpg');
  const bytes = await fetchBytes(url, POSTER_PHOTO_TIMEOUT_MS, POSTER_PHOTO_MAX_BYTES);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
}

interface PosterRow {
  id: string;
  type: string;
  status: string;
  description: string;
  approx_label: string;
  created_at: Date;
  species: string;
  size: string;
  sex: string | null;
  name: string | null;
  colors: AnimalColor[];
  temperament: string | null;
  photo: string | null;
  sightings: number;
  last_seen: string | null;
}

export async function posterHtml(
  pool: Pool,
  env: Env,
  postId: string,
  log: (error: unknown) => void,
): Promise<string | null> {
  const found = await pool.query<PosterRow>(
    `SELECT p.id, p.type, p.status, p.description, p.approx_label, p.created_at,
            a.species, a.size, a.sex, a.name, a.colors, a.temperament,
            (SELECT pm.url FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1)
              AS photo,
            (SELECT count(*)::int FROM sightings s WHERE s.post_id = p.id) AS sightings,
            (SELECT s.approx_label FROM sightings s WHERE s.post_id = p.id AND s.approx_label IS NOT NULL
             ORDER BY s.created_at DESC LIMIT 1) AS last_seen
     FROM posts p
     JOIN animals a ON a.id = p.animal_id
     JOIN users u ON u.id = p.author_id
     WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
       AND p.review_status = 'published' AND u.deleted_at IS NULL
       AND p.type IN ('lost', 'rescue_alert')`,
    [postId],
  );
  const post = found.rows[0];
  if (!post) return null;
  const lost = post.type === 'lost';
  const home = lost && post.status === 'rescued';
  const photo = await posterPhoto(env, post.photo ?? undefined).catch((error: unknown) => {
    log(error);
    return null;
  });
  const link = `${env.WEB_ORIGIN.replace(/\/+$/, '')}/?post=${encodeURIComponent(post.id)}`;
  const qr = await QRCode.toString(link, { type: 'svg', margin: 0, width: 160 });
  const title = home ? 'VOLTOU PARA CASA' : lost ? 'PROCURA-SE' : 'ENCONTRADO';
  const name = post.name?.trim() || speciesName[post.species] || 'Animal';
  const details = [
    speciesName[post.species],
    post.size ? `porte ${sizeName[post.size] ?? post.size}` : '',
    post.sex ? (sexName[post.sex] ?? '') : '',
    colorsOf({ colors: post.colors ?? [], text: post.description })
      .map((color) => animalColorLabel[color])
      .join(', '),
  ].filter(Boolean);
  const when = lost
    ? `Sumiu em ${escapeHtml(post.approx_label)} · ${belemDate(post.created_at)}`
    : `Visto em ${escapeHtml(post.approx_label)} · ${belemDate(post.created_at)}`;
  const seen =
    post.sightings > 0
      ? `<p class="seen">Já foi visto ${post.sightings} ${post.sightings === 1 ? 'vez' : 'vezes'}${post.last_seen ? `, por último em ${escapeHtml(post.last_seen)}` : ''}.</p>`
      : '';
  const call = lost
    ? 'Viu este animal? Abra o link ou aponte a câmera para o código e toque em “Vi esse animal”. Não precisa se aproximar.'
    : 'Reconhece este animal? Abra o link ou aponte a câmera para o código e fale com quem encontrou pelo app.';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}: ${escapeHtml(name)} · Égua, adota!</title>
<style>
  :root { --turquesa: #1F7A7A; --coral: #F26B4E; --creme: #FFF8EE; --texto: #2B2118; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--creme); color: var(--texto);
    font-family: 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 32px; }
  h1 { margin: 0; font-size: clamp(40px, 12vw, 84px); line-height: 1; letter-spacing: 2px;
    color: ${home ? 'var(--turquesa)' : 'var(--coral)'}; text-align: center; font-weight: 900; }
  .name { text-align: center; font-size: clamp(26px, 7vw, 40px); font-weight: 800; margin: 8px 0 16px; }
  .photo { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 16px; display: block;
    border: 6px solid var(--turquesa); background: #eee; }
  .nophoto { display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .facts { font-size: 22px; font-weight: 700; margin: 16px 0 4px; text-align: center; }
  .when { font-size: 18px; text-align: center; margin: 0 0 12px; }
  .desc { font-size: 17px; line-height: 1.45; white-space: pre-wrap; }
  .seen { font-size: 16px; color: var(--turquesa); font-weight: 700; }
  .cta { display: flex; gap: 16px; align-items: center; border-top: 3px dashed var(--turquesa);
    margin-top: 16px; padding-top: 16px; }
  .cta svg { width: 120px; height: 120px; flex: none; background: #fff; padding: 6px; border-radius: 8px; }
  .cta p { margin: 0 0 8px; font-size: 16px; line-height: 1.4; }
  .cta a { color: var(--turquesa); font-weight: 800; word-break: break-all; }
  .note { font-size: 13px; opacity: 0.75; margin-top: 16px; }
  .print { margin: 16px auto 0; display: block; padding: 12px 20px; border-radius: 999px; border: 0;
    background: var(--turquesa); color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; }
  @media print { .print { display: none; } body { background: #fff; } main { padding: 0; } }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <p class="name">${escapeHtml(name)}</p>
  ${photo ? `<img class="photo" src="${photo}" alt="Foto de ${escapeHtml(name)}">` : '<div class="photo nophoto">Sem foto</div>'}
  <p class="facts">${escapeHtml(details.join(' · '))}</p>
  <p class="when">${when}</p>
  <p class="desc">${escapeHtml(post.description.slice(0, 400))}</p>
  ${seen}
  <div class="cta">
    ${qr}
    <div>
      <p>${call}</p>
      <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>
    </div>
  </div>
  <p class="note">Égua, adota! · O contato do tutor fica só no app. Desconfie de quem pedir dinheiro em troca do animal.</p>
  <button class="print" type="button" onclick="window.print()">Imprimir ou salvar em PDF</button>
</main>
</body>
</html>`;
}

function bestEffort(request: FastifyRequest, where: string) {
  return (error: unknown) => {
    request.log.error({ err: error, where }, 'best-effort step failed');
  };
}

export function registerLostMatchRoutes(
  app: FastifyInstance,
  deps: {
    env: Env;
    pool: Pool;
    writeLimit: RouteLimit;
    strictLimit: RouteLimit;
    lookupLimit: RouteLimit;
  },
): void {
  const { env, pool, writeLimit, strictLimit, lookupLimit } = deps;

  // Sugestões de um post, para quem publicou (e a equipe). Do lado do perdido: animais que podem
  // ser ele. Do lado do encontrado: perdidos que podem ser este animal.
  app.get('/posts/:id/matches', async (request) => {
    const user = requireUser(request.user);
    const id = parseId(request.params, 'Esse post não existe mais.');
    const post = await postGate(pool, id);
    if (post.author_id !== user.id && !isOperator(user.role)) {
      throw new HttpError(403, 'Só quem publicou vê as sugestões deste post.');
    }
    const side = post.type === 'lost' ? 'lost' : FOUND_TYPES.includes(post.type) ? 'found' : null;
    if (!side) return { side: null, searching: false, matches: [] };
    return {
      side,
      // Perdido que já voltou para casa não procura mais.
      searching: side === 'found' || post.status === 'open',
      matches: await listMatches(pool, env, id, post.type),
    };
  });

  // "Procurar de novo": recalcula na hora, para quem publicou.
  app.post('/posts/:id/matches/refresh', strictLimit, async (request) => {
    const user = requireUser(request.user);
    const id = parseId(request.params, 'Esse post não existe mais.');
    const post = await postGate(pool, id);
    if (post.author_id !== user.id && !isOperator(user.role)) {
      throw new HttpError(403, 'Só quem publicou pode procurar de novo.');
    }
    const found = await processPostForMatches(pool, env, id, (error, where) =>
      bestEffort(request, where)(error),
    );
    return { found, matches: await listMatches(pool, env, id, post.type) };
  });

  // O tutor diz se é ou não o animal dele. Quem encontrou pode descartar ("não é esse").
  app.post('/lost-matches/:id/:decision', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = decisionParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Essa sugestão não existe mais.');
    const { id, decision } = parsed.data;
    const found = await pool.query<{
      lost_post_id: string;
      found_post_id: string;
      lost_author: string;
      found_author: string;
      status: string;
    }>(
      `SELECT m.lost_post_id, m.found_post_id, m.status,
              l.author_id AS lost_author, f.author_id AS found_author
       FROM lost_matches m
       JOIN posts l ON l.id = m.lost_post_id
       JOIN posts f ON f.id = m.found_post_id
       WHERE m.id = $1`,
      [id],
    );
    const match = found.rows[0];
    if (!match) throw new HttpError(404, 'Essa sugestão não existe mais.');
    const operator = isOperator(user.role);
    const isOwner = user.id === match.lost_author;
    const isFinder = user.id === match.found_author;
    if (decision === 'confirm' && !isOwner && !operator) {
      throw new HttpError(403, 'Só o tutor do animal perdido confirma.');
    }
    if (decision === 'dismiss' && !isOwner && !isFinder && !operator) {
      throw new HttpError(403, 'Só quem publicou um dos dois posts responde a sugestão.');
    }
    const status = decision === 'confirm' ? 'confirmed' : 'dismissed';
    if (match.status === status) return { status };
    await pool.query(
      `UPDATE lost_matches SET status = $2, decided_by = $3, decided_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, status, user.id],
    );
    if (decision === 'confirm') {
      await notifyPeople(pool, env, [match.found_author], 'lost_match_confirmed', {
        title: 'O tutor reconheceu o animal',
        body: 'Quem perdeu o animal acha que é o que você publicou. Combine pelo app como devolver, sem pagar nada.',
        postId: match.found_post_id,
        route: `/lost-matches/${match.found_post_id}`,
      }).catch(bestEffort(request, 'notify:lost-match-confirmed'));
    }
    return { status };
  });

  // Quem encontrou um animal procura entre os perdidos antes de publicar. Dados públicos só.
  app.get('/lost-search', lookupLimit, async (request) => {
    const parsed = lostSearchSchema.safeParse(request.query);
    if (!parsed.success) throw new HttpError(400, 'Diga a espécie e o lugar para procurar.');
    const input = parsed.data;
    const searcher: MatchAnimal = {
      species: input.species,
      size: input.size ?? 'medium',
      sex: input.sex ?? null,
      colors: input.colors,
      text: input.text ?? '',
      palette: null,
    };
    const rows = await pool.query<{
      id: string;
      created_at: Date;
      approx_label: string;
      description: string;
      species: MatchAnimal['species'];
      size: MatchAnimal['size'];
      sex: MatchAnimal['sex'];
      colors: AnimalColor[];
      name: string | null;
      text: string;
      meters: number;
      approx_lat: number;
      approx_lng: number;
      photo: string | null;
    }>(
      `SELECT p.id, p.created_at, p.approx_label, p.description,
              a.species, a.size, a.sex, a.colors, a.name, ${animalText('p', 'a')} AS text,
              d.meters,
              ST_Y(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lat,
              ST_X(ST_SnapToGrid(p.location::geometry, 0.005)::geometry) AS approx_lng,
              (SELECT pm.url FROM post_media pm WHERE pm.post_id = p.id ORDER BY pm.position LIMIT 1)
                AS photo
       FROM posts p
       JOIN animals a ON a.id = p.animal_id
       JOIN users u ON u.id = p.author_id
       CROSS JOIN LATERAL (
         SELECT min(ST_Distance(pt.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)) AS meters
         FROM (${pointsOf('p')}) pt
       ) d
       WHERE p.type = 'lost' AND p.status = 'open' AND p.parent_post_id IS NULL
         AND p.hidden = false AND p.review_status = 'published' AND u.deleted_at IS NULL
         AND a.species = $1
         AND p.created_at > now() - interval '120 days'
         AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, ${PREFILTER_METERS})
         AND d.meters <= $4
       LIMIT ${CANDIDATES_LIMIT}`,
      [input.species, input.longitude, input.latitude, MATCH_MAX_DISTANCE_KM * 1000],
    );
    const now = new Date();
    const results = rows.rows
      .map((row) => {
        const scored = scoreLostMatch(
          {
            species: row.species,
            size: row.size,
            sex: row.sex,
            colors: row.colors ?? [],
            text: row.text ?? '',
            palette: null,
          },
          // Sem porte informado, o porte não deve contar a favor nem contra.
          input.size ? searcher : { ...searcher, size: row.size },
          { distanceKm: row.meters / 1000, lostAt: row.created_at, seenAt: now },
        );
        if (!scored || scored.score < SEARCH_MIN_SCORE) return null;
        const reasons = input.size
          ? scored.reasons
          : scored.reasons.filter((reason) => reason.code !== 'size');
        const score = input.size
          ? scored.score
          : Math.max(
              0,
              scored.score - (scored.reasons.find((r) => r.code === 'size')?.points ?? 0),
            );
        return {
          score,
          strength: matchStrength(score),
          reasons,
          distanceKm: shownKm(row.meters),
          post: {
            id: row.id,
            approxLabel: row.approx_label,
            createdAt: row.created_at.toISOString(),
            description: row.description.slice(0, 280),
            location: { latitude: row.approx_lat, longitude: row.approx_lng, exact: false },
            animal: {
              species: row.species,
              size: row.size,
              sex: row.sex,
              name: row.name,
              colors: row.colors ?? [],
            },
            photo: row.photo
              ? {
                  url: publicMediaUrl(env, row.photo, 'full'),
                  thumbUrl: publicMediaUrl(env, row.photo, 'thumb'),
                }
              : null,
          },
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> => item !== null && item.score >= SEARCH_MIN_SCORE,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, LIST_LIMIT);
    return { results };
  });

  // Cartaz digital: página pronta para mandar no WhatsApp, imprimir ou salvar em PDF.
  app.get('/posts/:id/poster', async (request, reply) => {
    const id = parseId(request.params, 'Esse post não existe mais.');
    const html = await posterHtml(pool, env, id, bestEffort(request, 'poster:photo'));
    if (!html) throw new HttpError(404, 'Esse cartaz não existe mais.');
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
      .header(
        'Content-Security-Policy',
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      )
      .send(html);
  });
}
