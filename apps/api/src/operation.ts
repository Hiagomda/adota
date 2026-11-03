import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { leaveHelp } from './feed.js';
import { HttpError } from './http.js';
import { notifyDiaryNote, notifyPeople, notifyStatusChange } from './notify.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/**
 * Modo de operação do resgate: quem disse "vou ajudar" segue passos curtos (saí, cheguei,
 * encontrei ou não, resumo). Os passos usam o fluxo que já existe: encontrar muda o status pelo
 * PATCH de sempre e "não encontrei" sai do resgate pelo mesmo `leaveHelp`. A tabela guarda só a
 * hora de cada passo e o resumo, para a pessoa retomar de onde parou.
 */
const streetStatuses = new Set(['open', 'on_the_way', 'not_found']);
const ARRIVED_NOTE = 'Cheguei ao local.';
const SUMMARY_PREFIX = 'Resumo do atendimento: ';

const idParams = z.object({ id: z.string().uuid() });
const finishSchema = z
  .object({
    outcome: z.enum(['found', 'not_found', 'could_not']),
    summary: z.string().trim().max(400).optional(),
  })
  .strict();

interface OperationRow {
  departed_at: Date | null;
  arrived_at: Date | null;
  finished_at: Date | null;
  outcome: 'found' | 'not_found' | 'could_not' | null;
  summary: string | null;
}

interface PostGate {
  id: string;
  status: string;
  author_id: string;
  approx_label: string;
  animal_name: string | null;
  will_help: boolean;
}

function postId(params: unknown): string {
  const parsed = idParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Esse resgate não existe.');
  return parsed.data.id;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Alguém';
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);

async function gate(pool: Pool, id: string, user: SessionUser): Promise<PostGate> {
  const found = await pool.query<PostGate>(
    `SELECT p.id, p.status, p.author_id, p.approx_label, a.name AS animal_name,
            EXISTS (
              SELECT 1 FROM responses r
              WHERE r.post_id = p.id AND r.user_id = $2 AND r.kind = 'will_help'
            ) AS will_help
     FROM posts p JOIN animals a ON a.id = p.animal_id
     WHERE p.id = $1 AND p.type = 'rescue_alert' AND p.parent_post_id IS NULL
       AND p.hidden = false AND p.review_status = 'published'`,
    [id, user.id],
  );
  const post = found.rows[0];
  if (!post) throw new HttpError(404, 'Esse resgate não existe.');
  return post;
}

async function operationOf(pool: Pool, id: string, userId: string): Promise<OperationRow | null> {
  const found = await pool.query<OperationRow>(
    `SELECT departed_at, arrived_at, finished_at, outcome, summary
     FROM rescue_operations WHERE post_id = $1 AND user_id = $2`,
    [id, userId],
  );
  return found.rows[0] ?? null;
}

/** Linha do diário escrita por quem está no resgate (a mesma que "Não encontrei" já usa). */
async function diaryNote(pool: Pool, id: string, userId: string, text: string): Promise<void> {
  await pool.query(
    `INSERT INTO posts (
       author_id, animal_id, type, urgency, description, location, approx_label, status, parent_post_id
     )
     SELECT $2, animal_id, 'update', 'low', $3, location, approx_label, status, id
     FROM posts WHERE id = $1`,
    [id, userId, text],
  );
}

export async function loadOperation(pool: Pool, id: string, user: SessionUser) {
  const post = await gate(pool, id, user);
  const operation = await operationOf(pool, id, user.id);
  // Os outros que estão indo: primeiro nome e passo, para ninguém chegar achando que está só.
  const team = await pool.query<{
    name: string;
    departed_at: Date | null;
    arrived_at: Date | null;
  }>(
    `SELECT u.name, o.departed_at, o.arrived_at
     FROM responses r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN rescue_operations o ON o.post_id = r.post_id AND o.user_id = r.user_id
     WHERE r.post_id = $1 AND r.kind = 'will_help' AND r.user_id <> $2 AND u.deleted_at IS NULL
     ORDER BY r.created_at`,
    [id, user.id],
  );
  return {
    status: post.status,
    isAuthor: post.author_id === user.id,
    willHelp: post.will_help,
    // Entra no modo quem está indo e o animal ainda está na rua; quem já encontrou ainda pode
    // terminar o resumo.
    canOperate:
      (post.will_help && streetStatuses.has(post.status)) ||
      (operation !== null && operation.finished_at === null),
    operation: operation
      ? {
          departedAt: iso(operation.departed_at),
          arrivedAt: iso(operation.arrived_at),
          finishedAt: iso(operation.finished_at),
          outcome: operation.outcome,
          summary: operation.summary,
        }
      : null,
    team: team.rows.map((row) => ({
      name: firstName(row.name),
      departedAt: iso(row.departed_at),
      arrivedAt: iso(row.arrived_at),
    })),
  };
}

function requireGoing(post: PostGate): void {
  if (!post.will_help) {
    throw new HttpError(403, 'Toque em "Eu vou ajudar" antes de seguir os passos.');
  }
  if (!streetStatuses.has(post.status)) {
    throw new HttpError(400, 'O animal já saiu da rua. Termine com o resumo.');
  }
}

export function registerOperationRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit },
): void {
  const { env, pool, writeLimit } = deps;
  const bestEffort = (request: FastifyRequest, where: string) => (error: unknown) =>
    request.log.warn({ err: error }, `operation: ${where} failed`);

  app.get('/posts/:id/operation', async (request) => {
    const user = requireUser(request.user);
    return loadOperation(pool, postId(request.params), user);
  });

  app.post('/posts/:id/operation/departed', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = postId(request.params);
    const post = await gate(pool, id, user);
    requireGoing(post);
    const before = await operationOf(pool, id, user.id);
    await pool.query(
      `INSERT INTO rescue_operations (post_id, user_id, departed_at)
       VALUES ($1, $2, now())
       ON CONFLICT (post_id, user_id) DO UPDATE
         SET departed_at = COALESCE(rescue_operations.departed_at, now()),
             finished_at = NULL, outcome = NULL`,
      [id, user.id],
    );
    if (!before?.departed_at && post.author_id !== user.id) {
      await notifyPeople(pool, env, [post.author_id], 'operation', {
        title: 'Alguém saiu para ajudar',
        body: `${firstName(user.name)} está indo até ${post.approx_label}.`,
        postId: id,
        route: `/post/${id}`,
      }).catch(bestEffort(request, 'notify:departed'));
    }
    return loadOperation(pool, id, user);
  });

  app.post('/posts/:id/operation/arrived', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = postId(request.params);
    const post = await gate(pool, id, user);
    requireGoing(post);
    const before = await operationOf(pool, id, user.id);
    await pool.query(
      `INSERT INTO rescue_operations (post_id, user_id, departed_at, arrived_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (post_id, user_id) DO UPDATE
         SET departed_at = COALESCE(rescue_operations.departed_at, now()),
             arrived_at = COALESCE(rescue_operations.arrived_at, now()),
             finished_at = NULL, outcome = NULL`,
      [id, user.id],
    );
    // Só a primeira chegada vira linha no diário e aviso; tocar de novo não repete.
    if (!before?.arrived_at) {
      await diaryNote(pool, id, user.id, ARRIVED_NOTE);
      await notifyDiaryNote(
        pool,
        env,
        id,
        user.id,
        `${firstName(user.name)} chegou ao local.`,
      ).catch(bestEffort(request, 'notify:arrived'));
    }
    return loadOperation(pool, id, user);
  });

  app.post('/posts/:id/operation/finish', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = postId(request.params);
    const body = finishSchema.safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'Conte como terminou e tente de novo.');
    const post = await gate(pool, id, user);
    const before = await operationOf(pool, id, user.id);
    if (!post.will_help && !before) {
      throw new HttpError(403, 'Você não está neste resgate.');
    }
    const { outcome } = body.data;
    if (outcome === 'found') {
      if (streetStatuses.has(post.status)) {
        throw new HttpError(400, 'Marque primeiro como o animal ficou (resgatado, lar ou adoção).');
      }
    } else if (post.will_help) {
      // Não encontrou ou não deu: sai do resgate pelo caminho de sempre (volta para Aberto ou
      // marca Não encontrado quando era o último).
      const result = await leaveHelp(pool, id, user, outcome);
      if (result.changed) {
        await notifyStatusChange(pool, env, id, result.status).catch(
          bestEffort(request, 'notify:status'),
        );
      } else if (result.noted) {
        await notifyDiaryNote(pool, env, id, user.id, 'Não encontrei o animal.').catch(
          bestEffort(request, 'notify:not-found'),
        );
      }
    }
    const summary = body.data.summary ? stripControls(body.data.summary).trim() : '';
    if (before?.finished_at && before.outcome === outcome) {
      // Mesmo envio repetido (internet caiu): não escreve o resumo duas vezes.
      return loadOperation(pool, id, user);
    }
    await pool.query(
      `INSERT INTO rescue_operations (post_id, user_id, finished_at, outcome, summary)
       VALUES ($1, $2, now(), $3, $4)
       ON CONFLICT (post_id, user_id) DO UPDATE
         SET finished_at = now(), outcome = EXCLUDED.outcome, summary = EXCLUDED.summary`,
      [id, user.id, outcome, summary || null],
    );
    if (summary) {
      await diaryNote(pool, id, user.id, `${SUMMARY_PREFIX}${summary}`);
      await notifyDiaryNote(pool, env, id, user.id, summary).catch(
        bestEffort(request, 'notify:summary'),
      );
    }
    return loadOperation(pool, id, user);
  });
}
