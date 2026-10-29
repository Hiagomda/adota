import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Env } from './config.js';
import { publicMediaUrl } from './media.js';
import { neighborhoodFromLabel } from './neighborhoods.js';

/**
 * Painel "ao vivo" do site de apresentação. Público e anônimo, então só sai o que qualquer
 * pessoa já vê no mapa sem login, e menos ainda: nome e espécie do bicho, o bairro e a foto.
 * Nunca a descrição (pode ter telefone), o endereço, o ponto ou quem publicou.
 */

const ACTIVITY_SIZE = 12;
const CARDS_SIZE = 6;
const EVENTS_SIZE = 3;
const ACTIVITY_DAYS = 60;

export type LiveKind =
  'alert' | 'lost' | 'rescued' | 'home' | 'fostered' | 'for_adoption' | 'adopted';

/**
 * O que um post (raiz ou atualização) conta para o site. A raiz é o aviso novo; a atualização
 * só conta quando muda o status, porque nota de diário repete o status que já estava.
 */
export function liveKind(row: {
  is_root: boolean;
  root_type: string;
  status: string;
  previous_status: string | null;
}): LiveKind | null {
  if (row.is_root) {
    if (row.root_type === 'rescue_alert') return 'alert';
    if (row.root_type === 'lost') return 'lost';
    if (row.root_type === 'adoption' && row.status === 'for_adoption') return 'for_adoption';
    return null;
  }
  if (row.status === row.previous_status) return null;
  switch (row.status) {
    case 'rescued':
      return row.root_type === 'lost' ? 'home' : 'rescued';
    case 'fostered':
      return 'fostered';
    case 'for_adoption':
      return 'for_adoption';
    case 'adopted':
      return 'adopted';
    default:
      return null;
  }
}

/** Só o bairro sai do rótulo do lugar. Sem bairro, fica a cidade. */
export function liveNeighborhood(label: string): string {
  return neighborhoodFromLabel(label) ?? 'Belém';
}

// Posts que qualquer pessoa vê no feed: publicados, visíveis e de conta ativa.
const visible = `p.hidden = false AND p.review_status = 'published'
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id AND u.deleted_at IS NULL AND u.suspended = false)`;

const firstPhoto = `(SELECT m.url FROM post_media m WHERE m.post_id = COALESCE(p.parent_post_id, p.id)
  ORDER BY m.position LIMIT 1)`;

interface AnimalRow {
  id: string;
  species: string;
  animal_name: string | null;
  approx_label: string;
  photo: string | null;
  at: Date;
}

export function registerLiveRoutes(app: FastifyInstance, deps: { env: Env; pool: Pool }): void {
  const { env, pool } = deps;
  const photo = (stored: string | null) => (stored ? publicMediaUrl(env, stored, 'thumb') : null);
  const animal = (row: AnimalRow) => ({
    id: row.id,
    name: row.animal_name,
    species: row.species,
    neighborhood: liveNeighborhood(row.approx_label),
    photo: photo(row.photo),
    at: row.at.toISOString(),
  });

  app.get('/stats/live', async (_request, reply) => {
    const [counts, activity, adoption, lost, events] = await Promise.all([
      pool.query<{
        for_adoption: number;
        lost_now: number;
        adopted: number;
        rescued: number;
        home: number;
        alerts_month: number;
      }>(
        `SELECT
           count(*) FILTER (WHERE p.status = 'for_adoption')::int AS for_adoption,
           count(*) FILTER (WHERE p.type = 'lost' AND p.status IN ('open', 'on_the_way', 'not_found'))::int AS lost_now,
           count(*) FILTER (WHERE p.status = 'adopted')::int AS adopted,
           count(*) FILTER (WHERE p.type = 'rescue_alert' AND p.status IN ('rescued', 'fostered', 'for_adoption', 'adopted'))::int AS rescued,
           count(*) FILTER (WHERE p.type = 'lost' AND p.status = 'rescued')::int AS home,
           count(*) FILTER (WHERE p.type IN ('rescue_alert', 'lost') AND p.created_at > now() - interval '30 days')::int AS alerts_month
         FROM posts p
         WHERE p.parent_post_id IS NULL AND ${visible}`,
      ),
      pool.query<
        AnimalRow & {
          is_root: boolean;
          root_type: string;
          status: string;
          previous_status: string | null;
        }
      >(
        `SELECT * FROM (
           SELECT p.id, a.species, a.name AS animal_name, p.approx_label, p.status,
                  p.parent_post_id IS NULL AS is_root, r.type AS root_type, p.created_at AS at,
                  ${firstPhoto} AS photo,
                  CASE WHEN p.parent_post_id IS NULL THEN NULL ELSE COALESCE(
                    (SELECT prev.status FROM posts prev
                     WHERE prev.parent_post_id = p.parent_post_id
                       AND (prev.created_at, prev.id) < (p.created_at, p.id)
                     ORDER BY prev.created_at DESC, prev.id DESC LIMIT 1),
                    'open'
                  ) END AS previous_status
           FROM posts p
           JOIN posts r ON r.id = COALESCE(p.parent_post_id, p.id)
           JOIN animals a ON a.id = p.animal_id
           WHERE ${visible} AND r.hidden = false AND r.review_status = 'published'
             AND r.type IN ('rescue_alert', 'lost', 'adoption')
             AND p.created_at > now() - make_interval(days => $1)
           ORDER BY p.created_at DESC
           LIMIT 200
         ) recent
         ORDER BY at DESC`,
        [ACTIVITY_DAYS],
      ),
      pool.query<AnimalRow>(
        `SELECT p.id, a.species, a.name AS animal_name, p.approx_label, ${firstPhoto} AS photo,
                COALESCE((SELECT min(c.created_at) FROM posts c
                          WHERE c.parent_post_id = p.id AND c.status = 'for_adoption'), p.created_at) AS at
         FROM posts p JOIN animals a ON a.id = p.animal_id
         WHERE p.parent_post_id IS NULL AND p.status = 'for_adoption' AND ${visible}
         ORDER BY at DESC LIMIT $1`,
        [CARDS_SIZE],
      ),
      pool.query<AnimalRow>(
        `SELECT p.id, a.species, a.name AS animal_name, p.approx_label, ${firstPhoto} AS photo,
                p.created_at AS at
         FROM posts p JOIN animals a ON a.id = p.animal_id
         WHERE p.parent_post_id IS NULL AND p.type = 'lost'
           AND p.status IN ('open', 'on_the_way', 'not_found') AND ${visible}
         ORDER BY p.created_at DESC LIMIT $1`,
        [CARDS_SIZE],
      ),
      pool.query<{
        id: string;
        title: string;
        category: string;
        neighborhood: string | null;
        place_label: string;
        starts_at: Date;
      }>(
        `SELECT e.id, e.title, e.category, e.neighborhood, e.place_label, e.starts_at
         FROM adoption_events e
         JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL AND u.suspended = false
         WHERE e.hidden = false AND e.review_status = 'published' AND e.cancelled_at IS NULL
           AND e.ends_at > now()
         ORDER BY e.starts_at ASC LIMIT $1`,
        [EVENTS_SIZE],
      ),
    ]);

    const recent = [];
    for (const row of activity.rows) {
      const kind = liveKind(row);
      if (!kind) continue;
      recent.push({ kind, ...animal(row) });
      if (recent.length === ACTIVITY_SIZE) break;
    }
    const total = counts.rows[0];

    // Um minuto de cache: o site consulta de tempos em tempos e não precisa bater no banco a cada visita.
    reply.header('Cache-Control', 'public, max-age=60');
    return {
      updatedAt: new Date().toISOString(),
      counts: {
        forAdoption: total?.for_adoption ?? 0,
        lostNow: total?.lost_now ?? 0,
        adopted: total?.adopted ?? 0,
        rescued: total?.rescued ?? 0,
        backHome: total?.home ?? 0,
        alertsLast30Days: total?.alerts_month ?? 0,
      },
      activity: recent,
      forAdoption: adoption.rows.map(animal),
      lost: lost.rows.map(animal),
      events: events.rows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        neighborhood: row.neighborhood ?? liveNeighborhood(row.place_label),
        startsAt: row.starts_at.toISOString(),
      })),
    };
  });
}
