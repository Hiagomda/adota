import {
  adoptionEventSchema,
  adoptionInterestSchema,
  insideServiceArea,
  looksLikeAnimalSale,
  verificationRequestSchema,
  type AdoptionInterestInput,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { listWaitingForAdoption } from './feed.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { notifyAdoptionInterest } from './notify.js';
import { rowsOf, type SessionUser } from './session.js';
import { stripControls } from './text.js';

/** Abaixo disso o animal ainda é novidade: a fileira mostra quem está ficando para trás. */
export const WAITING_MIN_DAYS = 14;
const WAITING_LIMIT = 12;
const EVENTS_LIMIT = 30;

type RouteLimit = { config: object };

/**
 * Valida e devolve a mensagem do próprio schema quando ela foi escrita para a pessoa
 * (as de `superRefine`), senão a genérica.
 */
function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function postId(params: unknown): string {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Esse animal não existe mais.');
  return parsed.data.id;
}

/** Quem pode divulgar feira: perfil verificado de ONG ou protetor, ou a equipe. */
export function canOrganizeEvents(user: SessionUser): boolean {
  if (isOperator(user.role)) return true;
  return user.verified && (user.role === 'ngo' || user.role === 'protector');
}

/** Respostas guardadas sem a nota, que vai numa coluna própria. */
function storedAnswers(input: AdoptionInterestInput): Omit<AdoptionInterestInput, 'note'> {
  return {
    home: input.home,
    safeHome: input.safeHome,
    otherAnimals: input.otherAnimals,
    household: input.household,
    hadPets: input.hadPets,
  };
}

interface InterestRow {
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  answers: Omit<AdoptionInterestInput, 'note'>;
  note: string | null;
  updated_at: Date;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  place_label: string;
  latitude: number;
  longitude: number;
  starts_at: Date;
  ends_at: Date;
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  verified: boolean;
  role: string;
}

interface VerificationRow {
  status: 'pending' | 'approved' | 'rejected';
  kind: string;
  organization_name: string;
  created_at: Date;
  decided_at: Date | null;
}

export function registerAdoptionRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; strictLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, strictLimit } = deps;
  const avatar = (stored: string | null) => (stored ? publicMediaUrl(env, stored, 'thumb') : null);

  // Ficha do interessado. Fica guardada antes de abrir o WhatsApp, para quem cuida rever depois.
  app.post('/posts/:id/adoption-interest', writeLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode fazer isso.');
    const id = postId(request.params);
    const input = parse(adoptionInterestSchema, request.body);
    const note = input.note ? stripControls(input.note).trim() : '';
    if (note && looksLikeAnimalSale(note)) {
      throw new HttpError(400, 'Não é permitido vender animais. O app não recebe dinheiro.');
    }
    const post = await pool.query<{ author_id: string; status: string }>(
      `SELECT p.author_id, p.status FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false
         AND p.review_status = 'published' AND u.deleted_at IS NULL AND u.suspended = false`,
      [id],
    );
    const found = post.rows[0];
    if (!found) throw new HttpError(404, 'Esse animal não existe mais.');
    if (found.author_id === user.id) throw new HttpError(400, 'Esse animal é seu.');
    if (found.status !== 'for_adoption') {
      throw new HttpError(400, 'Esse animal não está mais para adoção.');
    }
    const blocked = await pool.query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [user.id, found.author_id],
    );
    if ((blocked.rowCount ?? 0) > 0) throw new HttpError(404, 'Esse animal não existe mais.');
    const saved = await pool.query<{ first: boolean }>(
      `INSERT INTO adoption_interests (post_id, user_id, answers, note)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (post_id, user_id)
       DO UPDATE SET answers = EXCLUDED.answers, note = EXCLUDED.note, updated_at = now()
       RETURNING (xmax = 0) AS first`,
      [id, user.id, JSON.stringify(storedAnswers(input)), note || null],
    );
    // Só a primeira ficha avisa quem cuida; corrigir a resposta não vira outro aviso.
    if (saved.rows[0]?.first) {
      await notifyAdoptionInterest(pool, env, id, found.author_id, user.name).catch(
        (error: unknown) => {
          request.log.error({ err: error, where: 'notify:adoption-interest' }, 'best-effort');
        },
      );
    }
    return reply.code(201).send({ saved: true });
  });

  // Quem cuida (e a equipe) vê as fichas. Ninguém mais: são respostas sobre a casa de alguém.
  app.get('/posts/:id/adoption-interests', async (request) => {
    const user = requireUser(request.user);
    const id = postId(request.params);
    const post = await pool.query<{ author_id: string }>(
      `SELECT author_id FROM posts WHERE id = $1 AND parent_post_id IS NULL`,
      [id],
    );
    const found = post.rows[0];
    if (!found) throw new HttpError(404, 'Esse animal não existe mais.');
    if (found.author_id !== user.id && !isOperator(user.role)) {
      throw new HttpError(403, 'Só quem cuida do animal vê as fichas.');
    }
    const result = await pool.query(
      `SELECT i.user_id, u.name, u.handle, u.avatar_url, u.verified, i.answers, i.note, i.updated_at
       FROM adoption_interests i
       JOIN users u ON u.id = i.user_id AND u.deleted_at IS NULL AND u.suspended = false
       WHERE i.post_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $2 AND b.blocked_id = i.user_id)
              OR (b.blocker_id = i.user_id AND b.blocked_id = $2)
         )
       ORDER BY i.updated_at DESC
       LIMIT 50`,
      [id, found.author_id],
    );
    return {
      interests: rowsOf<InterestRow>(result).map((row) => ({
        person: {
          id: row.user_id,
          name: row.name,
          handle: row.handle,
          avatarUrl: avatar(row.avatar_url),
          verified: row.verified,
        },
        answers: row.answers,
        note: row.note,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  });

  // As últimas respostas da própria pessoa, para não preencher tudo de novo no próximo animal.
  app.get('/me/adoption-interest', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query<{ answers: Omit<AdoptionInterestInput, 'note'> }>(
      `SELECT answers FROM adoption_interests WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [user.id],
    );
    return { answers: result.rows[0]?.answers ?? null };
  });

  app.get('/adoption/waiting', async (request) => {
    const query = parse(
      z.object({ species: z.enum(['dog', 'cat', 'other']).optional() }),
      request.query,
    );
    return listWaitingForAdoption(pool, env, request.user, {
      minDays: WAITING_MIN_DAYS,
      limit: WAITING_LIMIT,
      species: query.species,
    });
  });

  app.get('/adoption-events', async (request) => {
    const viewer = request.user;
    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.place_label,
              ST_Y(e.location::geometry) AS latitude, ST_X(e.location::geometry) AS longitude,
              e.starts_at, e.ends_at,
              u.id AS user_id, u.name, u.handle, u.avatar_url, u.verified, u.role
       FROM adoption_events e
       JOIN users u ON u.id = e.user_id AND u.deleted_at IS NULL AND u.suspended = false
       WHERE e.hidden = false AND e.ends_at > now()
         AND ($1::uuid IS NULL OR NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = e.user_id)
              OR (b.blocker_id = e.user_id AND b.blocked_id = $1)
         ))
       ORDER BY e.starts_at ASC, e.id ASC
       LIMIT ${EVENTS_LIMIT}`,
      [viewer?.id ?? null],
    );
    return {
      // Avisa o app se mostra o botão de divulgar. APKs antigos não usam esta rota.
      canCreate: viewer ? canOrganizeEvents(viewer) : false,
      events: rowsOf<EventRow>(result).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        placeLabel: row.place_label,
        // A feira é em lugar público: o ponto vai exato.
        location: { latitude: row.latitude, longitude: row.longitude },
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        organizer: {
          id: row.user_id,
          name: row.name,
          handle: row.handle,
          avatarUrl: avatar(row.avatar_url),
          verified: row.verified,
          role: row.role,
        },
        mine: viewer ? viewer.id === row.user_id : false,
        canRemove: viewer ? viewer.id === row.user_id || isOperator(viewer.role) : false,
      })),
    };
  });

  app.post('/adoption-events', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended || !canOrganizeEvents(user)) {
      throw new HttpError(403, 'Só ONG ou protetor verificado divulga feira de adoção.');
    }
    const input = parse(adoptionEventSchema, request.body);
    if (Date.parse(input.endsAt) <= Date.now()) {
      throw new HttpError(400, 'Essa feira já terminou. Confira o dia e a hora.');
    }
    if (!insideServiceArea(input)) {
      throw new HttpError(400, 'Por enquanto o Égua, adota! funciona só em Belém e região.');
    }
    const title = stripControls(input.title).trim();
    const description = input.description ? stripControls(input.description).trim() : '';
    if (looksLikeAnimalSale(title) || looksLikeAnimalSale(description)) {
      throw new HttpError(400, 'Não é permitido vender animais. Feira aqui é só de adoção.');
    }
    const created = await pool.query<{ id: string }>(
      `INSERT INTO adoption_events (user_id, title, description, place_label, location, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8)
       RETURNING id`,
      [
        user.id,
        title,
        description || null,
        stripControls(input.placeLabel).trim(),
        input.longitude,
        input.latitude,
        input.startsAt,
        input.endsAt,
      ],
    );
    return reply.code(201).send({ id: created.rows[0]?.id });
  });

  app.delete('/adoption-events/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Essa feira não existe mais.');
    const result = await pool.query(
      `UPDATE adoption_events SET hidden = true
       WHERE id = $1 AND hidden = false AND (user_id = $2 OR $3::boolean)`,
      [parsed.data.id, user.id, isOperator(user.role)],
    );
    if ((result.rowCount ?? 0) === 0) throw new HttpError(404, 'Essa feira não existe mais.');
    return { removed: true };
  });

  // Cadastro de ONG ou protetor: um pedido por vez na fila da equipe.
  app.get('/me/verification', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query<VerificationRow>(
      `SELECT status, kind, organization_name, created_at, decided_at
       FROM verification_requests WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    const last = result.rows[0];
    return {
      verified: user.verified,
      role: user.role,
      request: last
        ? {
            status: last.status,
            kind: last.kind,
            organizationName: last.organization_name,
            createdAt: last.created_at.toISOString(),
            decidedAt: last.decided_at?.toISOString() ?? null,
          }
        : null,
    };
  });

  app.post('/me/verification', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const body = parse(verificationRequestSchema, request.body);
    if (user.verified) throw new HttpError(409, 'Seu perfil já é verificado.');
    const pending = await pool.query(
      `SELECT 1 FROM verification_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [user.id],
    );
    if ((pending.rowCount ?? 0) > 0) {
      throw new HttpError(409, 'Seu pedido já está na fila. A equipe avisa quando analisar.');
    }
    await pool.query(
      `INSERT INTO verification_requests
         (user_id, organization_name, note, kind, instagram, cnpj, neighborhood)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        user.id,
        stripControls(body.organizationName).trim(),
        body.note ? stripControls(body.note).trim() || null : null,
        body.kind,
        body.instagram || null,
        body.cnpj || null,
        body.neighborhood ? stripControls(body.neighborhood).trim() || null : null,
      ],
    );
    return reply.code(201).send({ status: 'pending' });
  });
}
