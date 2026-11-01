import { ngoThemeSchema, type NgoAccent } from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { listOrgAnimals } from './feed.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { rowsOf, type SessionUser } from './session.js';
import { stripControls } from './text.js';

/** Bastante para uma ONG grande sem pesar a tela; o resto ela acha no perfil. */
const ANIMALS_LIMIT = 100;
const RECENT_INTERESTS = 10;
/** Ficha "nova" é da última semana. */
const NEW_INTEREST_DAYS = 7;

type RouteLimit = { config: object };

/** O painel é de quem tem o selo: ONG ou protetor verificado. */
export function canUseNgoPanel(user: SessionUser): boolean {
  return user.verified && (user.role === 'ngo' || user.role === 'protector');
}

interface OrgRow {
  name: string;
  handle: string;
  avatar_url: string | null;
  role: string;
  organization_name: string | null;
  instagram: string | null;
  neighborhood: string | null;
  accent: NgoAccent | null;
  tagline: string | null;
}

interface CountRow {
  post_id: string;
  total: number;
  fresh: number;
}

interface StatsRow {
  rescue: number;
  care: number;
  for_adoption: number;
  adopted_total: number;
  adopted_month: number;
  interests_week: number;
}

interface RecentInterestRow {
  post_id: string;
  animal_name: string | null;
  species: string;
  photo: string | null;
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  answers: Record<string, unknown>;
  note: string | null;
  updated_at: Date;
}

/** Fichas que contam para a ONG: de quem não está bloqueado nem suspenso. */
const visibleInterest = `
  JOIN users iu ON iu.id = i.user_id AND iu.deleted_at IS NULL AND iu.suspended = false
  WHERE p.author_id = $1
    AND p.parent_post_id IS NULL
    AND p.hidden = false
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = $1 AND b.blocked_id = i.user_id)
         OR (b.blocker_id = i.user_id AND b.blocked_id = $1)
    )`;

export function registerNgoPanelRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit },
): void {
  const { env, pool, writeLimit } = deps;
  const media = (stored: string | null) => (stored ? publicMediaUrl(env, stored, 'thumb') : null);

  function requirePanel(user: SessionUser | null): SessionUser {
    const owner = requireUser(user);
    if (!canUseNgoPanel(owner)) {
      throw new HttpError(403, 'O painel é das ONGs e protetores verificados.');
    }
    return owner;
  }

  // Tudo o que a ONG acompanha numa tela: animais, fichas novas e números do mês.
  app.get('/me/ngo-panel', async (request) => {
    const owner = requirePanel(request.user);
    const [org, stats, counts, recent, animals] = await Promise.all([
      pool.query<OrgRow>(
        `SELECT u.name, u.handle, u.avatar_url, u.role,
                v.organization_name, v.instagram, v.neighborhood,
                s.accent, s.tagline
         FROM users u
         LEFT JOIN LATERAL (
           SELECT organization_name, instagram, neighborhood FROM verification_requests
           WHERE user_id = u.id AND status = 'approved'
           ORDER BY decided_at DESC NULLS LAST, created_at DESC LIMIT 1
         ) v ON true
         LEFT JOIN ngo_panel_settings s ON s.user_id = u.id
         WHERE u.id = $1`,
        [owner.id],
      ),
      pool.query<StatsRow>(
        `SELECT
           count(*) FILTER (WHERE p.status IN ('open', 'on_the_way'))::int AS rescue,
           count(*) FILTER (WHERE p.status IN ('rescued', 'fostered'))::int AS care,
           count(*) FILTER (WHERE p.status = 'for_adoption')::int AS for_adoption,
           count(*) FILTER (WHERE p.status = 'adopted')::int AS adopted_total,
           count(*) FILTER (
             WHERE p.status = 'adopted'
               AND COALESCE(
                 (SELECT max(c.created_at) FROM posts c
                  WHERE c.parent_post_id = p.id AND c.status = 'adopted'),
                 p.created_at
               ) >= date_trunc('month', now() AT TIME ZONE 'America/Belem') AT TIME ZONE 'America/Belem'
           )::int AS adopted_month,
           (SELECT count(*) FROM adoption_interests i
              JOIN posts p ON p.id = i.post_id
              ${visibleInterest}
                AND i.updated_at > now() - make_interval(days => ${NEW_INTEREST_DAYS}))::int
             AS interests_week
         FROM posts p
         WHERE p.author_id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
           AND p.type <> 'lost'`,
        [owner.id],
      ),
      pool.query<CountRow>(
        `SELECT i.post_id,
                count(*)::int AS total,
                count(*) FILTER (
                  WHERE i.updated_at > now() - make_interval(days => ${NEW_INTEREST_DAYS})
                )::int AS fresh
         FROM adoption_interests i
         JOIN posts p ON p.id = i.post_id
         ${visibleInterest}
         GROUP BY i.post_id`,
        [owner.id],
      ),
      pool.query(
        `SELECT i.post_id, a.name AS animal_name, a.species,
                (SELECT m.url FROM post_media m WHERE m.post_id = p.id
                 ORDER BY m.position ASC LIMIT 1) AS photo,
                i.user_id, iu.name, iu.handle, iu.avatar_url, iu.verified,
                i.answers, i.note, i.updated_at
         FROM adoption_interests i
         JOIN posts p ON p.id = i.post_id
         JOIN animals a ON a.id = p.animal_id
         ${visibleInterest}
         ORDER BY i.updated_at DESC
         LIMIT ${RECENT_INTERESTS}`,
        [owner.id],
      ),
      listOrgAnimals(pool, env, owner, ANIMALS_LIMIT),
    ]);

    const info = org.rows[0];
    if (!info) throw new HttpError(404, 'Conta não encontrada.');
    const numbers = stats.rows[0];
    const byPost = new Map(counts.rows.map((row) => [row.post_id, row]));
    return {
      org: {
        name: info.organization_name ?? info.name,
        handle: info.handle,
        avatarUrl: media(info.avatar_url),
        role: info.role,
        instagram: info.instagram,
        neighborhood: info.neighborhood,
      },
      theme: { accent: info.accent ?? 'turquoise', tagline: info.tagline },
      stats: {
        rescue: numbers?.rescue ?? 0,
        care: numbers?.care ?? 0,
        forAdoption: numbers?.for_adoption ?? 0,
        adoptedTotal: numbers?.adopted_total ?? 0,
        adoptedThisMonth: numbers?.adopted_month ?? 0,
        newInterests: numbers?.interests_week ?? 0,
      },
      animals: animals.map((post) => {
        const interest = byPost.get(post.id);
        return { post, interests: interest?.total ?? 0, newInterests: interest?.fresh ?? 0 };
      }),
      recentInterests: rowsOf<RecentInterestRow>(recent).map((row) => ({
        postId: row.post_id,
        animal: { name: row.animal_name, species: row.species, photoUrl: media(row.photo) },
        person: {
          id: row.user_id,
          name: row.name,
          handle: row.handle,
          avatarUrl: media(row.avatar_url),
          verified: row.verified,
        },
        answers: row.answers,
        note: row.note,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });

  app.put('/me/ngo-panel/theme', writeLimit, async (request) => {
    const owner = requirePanel(request.user);
    const parsed = ngoThemeSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'Escolha uma das cores do app.');
    const tagline = parsed.data.tagline ? stripControls(parsed.data.tagline).trim() : '';
    await pool.query(
      `INSERT INTO ngo_panel_settings (user_id, accent, tagline, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET accent = EXCLUDED.accent, tagline = EXCLUDED.tagline, updated_at = now()`,
      [owner.id, parsed.data.accent, tagline || null],
    );
    return { accent: parsed.data.accent, tagline: tagline || null };
  });
}
