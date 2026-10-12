import { looksLikeAnimalSale } from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { stripControls } from './text.js';

const moneyPattern = /\bpix\b|chave\s+pix/i;

/** Stored chat text. Rejects sale and payment talk before it reaches the database. */
export function prepareAdoptionMessage(raw: string): string {
  const body = stripControls(raw).trim();
  if (body.length < 1 || body.length > 500) {
    throw new HttpError(400, 'Escreva uma mensagem de até 500 caracteres.');
  }
  if (looksLikeAnimalSale(body) || moneyPattern.test(body)) {
    throw new HttpError(
      400,
      'Não dá para combinar venda ou Pix por aqui. O app não recebe dinheiro.',
    );
  }
  return body;
}

interface PostGate {
  id: string;
  author_id: string;
  status: string;
  hidden: boolean;
  review_status: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  author_deleted: Date | null;
  author_suspended: boolean;
}

interface PersonRow {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}

interface ThreadRow {
  id: string;
  adopter_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  last_body: string | null;
  last_at: Date | null;
}

interface MessageRow {
  id: string;
  body: string;
  created_at: Date;
  sender_id: string;
}

function uuidParam(params: unknown): string {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Essa conversa não existe.');
  return parsed.data.id;
}

function avatar(env: Env, stored: string | null): string | null {
  if (!stored) return null;
  return publicMediaUrl(env, stored, 'thumb');
}

async function blocked(pool: Pool, left: string, right: string): Promise<boolean> {
  const found = await pool.query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [left, right],
  );
  return (found.rowCount ?? 0) > 0;
}

async function loadPost(pool: Pool, postId: string): Promise<PostGate> {
  const result = await pool.query<PostGate>(
    `SELECT p.id, p.author_id, p.status, p.hidden, p.review_status,
            a.name AS author_name, a.handle AS author_handle, a.avatar_url AS author_avatar,
            a.deleted_at AS author_deleted, a.suspended AS author_suspended
     FROM posts p
     JOIN users a ON a.id = p.author_id
     WHERE p.id = $1`,
    [postId],
  );
  const post = result.rows[0];
  if (
    !post ||
    post.hidden ||
    post.review_status !== 'published' ||
    post.author_deleted ||
    post.author_suspended
  ) {
    throw new HttpError(404, 'Essa conversa não existe.');
  }
  return post;
}

export function registerAdoptionChat(app: FastifyInstance, deps: { env: Env; pool: Pool }): void {
  const { env, pool } = deps;

  app.get('/posts/:id/adoption-chats', async (request) => {
    const user = requireUser(request.user);
    const postId = uuidParam(request.params);
    const post = await loadPost(pool, postId);
    if (await blocked(pool, user.id, post.author_id)) {
      throw new HttpError(404, 'Essa conversa não existe.');
    }
    const author = user.id === post.author_id;
    if (!author && post.status !== 'for_adoption' && post.status !== 'adopted') {
      throw new HttpError(400, 'Esse animal não está para adoção.');
    }
    const threads = await pool.query<ThreadRow>(
      `SELECT t.id, t.adopter_id, u.name, u.handle, u.avatar_url, m.body AS last_body, m.created_at AS last_at
       FROM adoption_threads t
       JOIN users u ON u.id = t.adopter_id AND u.deleted_at IS NULL AND u.suspended = false
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM adoption_messages
         WHERE thread_id = t.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE t.post_id = $1
         AND ($2::uuid IS NULL OR t.adopter_id = $2)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $3 AND b.blocked_id = t.adopter_id)
              OR (b.blocker_id = t.adopter_id AND b.blocked_id = $3)
         )
       ORDER BY m.created_at DESC NULLS LAST, t.created_at DESC
       LIMIT 50`,
      [postId, author ? null : user.id, user.id],
    );
    return {
      role: author ? 'author' : 'adopter',
      canStart: !author && post.status === 'for_adoption',
      other: author
        ? null
        : {
            id: post.author_id,
            name: post.author_name,
            handle: post.author_handle,
            avatarUrl: avatar(env, post.author_avatar),
          },
      threads: threads.rows.map((row) => ({
        id: row.id,
        adopterId: row.adopter_id,
        lastBody: row.last_body,
        lastAt: row.last_at?.toISOString() ?? null,
        other: {
          id: author ? row.adopter_id : post.author_id,
          name: author ? row.name : post.author_name,
          handle: author ? row.handle : post.author_handle,
          avatarUrl: avatar(env, author ? row.avatar_url : post.author_avatar),
        },
      })),
    };
  });

  app.get('/posts/:id/adoption-chats/messages', async (request) => {
    const user = requireUser(request.user);
    const postId = uuidParam(request.params);
    const query = z
      .object({
        adopterId: z.string().uuid().optional(),
        before: z.string().datetime({ offset: true }).optional(),
      })
      .safeParse(request.query);
    if (!query.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
    const post = await loadPost(pool, postId);
    const author = user.id === post.author_id;
    const adopterId = author ? query.data.adopterId : user.id;
    if (!adopterId) throw new HttpError(400, 'Escolha a conversa para abrir.');
    if (await blocked(pool, user.id, author ? adopterId : post.author_id)) {
      throw new HttpError(404, 'Essa conversa não existe.');
    }
    if (author) {
      const person = await pool.query<PersonRow>(
        `SELECT id, name, handle, avatar_url FROM users
         WHERE id = $1 AND deleted_at IS NULL AND suspended = false`,
        [adopterId],
      );
      const other = person.rows[0];
      const thread = await pool.query(
        `SELECT 1 FROM adoption_threads WHERE post_id = $1 AND adopter_id = $2`,
        [postId, adopterId],
      );
      if (!other || (thread.rowCount ?? 0) === 0)
        throw new HttpError(404, 'Essa conversa não existe.');
      const page = await loadMessages(pool, postId, adopterId, user.id, query.data.before);
      return {
        other: {
          id: other.id,
          name: other.name,
          handle: other.handle,
          avatarUrl: avatar(env, other.avatar_url),
        },
        ...page,
      };
    }
    if (post.status !== 'for_adoption' && post.status !== 'adopted') {
      throw new HttpError(400, 'Esse animal não está para adoção.');
    }
    const page = await loadMessages(pool, postId, user.id, user.id, query.data.before);
    return {
      other: {
        id: post.author_id,
        name: post.author_name,
        handle: post.author_handle,
        avatarUrl: avatar(env, post.author_avatar),
      },
      ...page,
    };
  });

  app.post(
    '/posts/:id/adoption-chats/messages',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = requireUser(request.user);
      if (user.suspended) throw new HttpError(403, 'Essa conta não pode enviar mensagens.');
      const postId = uuidParam(request.params);
      const parsed = z
        .object({ body: z.string(), adopterId: z.string().uuid().optional() })
        .safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
      const body = prepareAdoptionMessage(parsed.data.body);
      const post = await loadPost(pool, postId);
      const author = user.id === post.author_id;
      const adopterId = author ? parsed.data.adopterId : user.id;
      if (!adopterId || adopterId === post.author_id) {
        throw new HttpError(400, 'Escolha com quem você está falando.');
      }
      const otherId = author ? adopterId : post.author_id;
      if (await blocked(pool, user.id, otherId)) {
        throw new HttpError(404, 'Essa conversa não existe.');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM adoption_threads WHERE post_id = $1 AND adopter_id = $2`,
          [postId, adopterId],
        );
        let threadId = existing.rows[0]?.id;
        if (!threadId && author) throw new HttpError(404, 'Essa conversa não existe.');
        if (!threadId && post.status !== 'for_adoption') {
          throw new HttpError(400, 'Esse animal não está mais para adoção.');
        }
        if (!threadId) {
          const created = await client.query<{ id: string }>(
            `INSERT INTO adoption_threads (post_id, adopter_id) VALUES ($1, $2)
             ON CONFLICT (post_id, adopter_id) DO NOTHING
             RETURNING id`,
            [postId, adopterId],
          );
          threadId = created.rows[0]?.id;
          if (!threadId) {
            const again = await client.query<{ id: string }>(
              `SELECT id FROM adoption_threads WHERE post_id = $1 AND adopter_id = $2`,
              [postId, adopterId],
            );
            threadId = again.rows[0]?.id;
          }
        }
        if (!threadId) throw new HttpError(500, 'Não consegui abrir a conversa.');
        const saved = await client.query<{ id: string; created_at: Date }>(
          `INSERT INTO adoption_messages (thread_id, sender_id, body)
           VALUES ($1, $2, $3)
           RETURNING id, created_at`,
          [threadId, user.id, body],
        );
        const message = saved.rows[0];
        if (!message) throw new HttpError(500, 'Não consegui enviar a mensagem.');
        await client.query(
          `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'adoption_chat', $2::jsonb)`,
          [
            otherId,
            JSON.stringify({
              title: 'Nova mensagem',
              body: 'Tem uma mensagem nova na conversa de adoção. O telefone continua oculto.',
              postId,
              adopterId,
            }),
          ],
        );
        await client.query('COMMIT');
        return reply.code(201).send({
          id: message.id,
          body,
          createdAt: message.created_at.toISOString(),
          mine: true,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  );
}

async function loadMessages(
  pool: Pool,
  postId: string,
  adopterId: string,
  viewerId: string,
  before: string | undefined,
): Promise<{
  messages: { id: string; body: string; createdAt: string; mine: boolean }[];
  nextCursor: string | null;
}> {
  const result = await pool.query<MessageRow>(
    `SELECT m.id, m.body, m.created_at, m.sender_id
     FROM adoption_messages m
     JOIN adoption_threads t ON t.id = m.thread_id
     WHERE t.post_id = $1 AND t.adopter_id = $2
       AND ($3::timestamptz IS NULL OR m.created_at < $3)
     ORDER BY m.created_at DESC
     LIMIT 41`,
    [postId, adopterId, before ?? null],
  );
  const hasMore = result.rows.length > 40;
  const slice = hasMore ? result.rows.slice(0, 40) : result.rows;
  const ordered = slice.slice().reverse();
  const oldest = ordered[0];
  return {
    messages: ordered.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at.toISOString(),
      mine: row.sender_id === viewerId,
    })),
    nextCursor: hasMore && oldest ? oldest.created_at.toISOString() : null,
  };
}
