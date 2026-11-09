import {
  chatFlagTip,
  chatNoticeVersion,
  scanChatMessage,
  type ChatFlag,
  type ChatScan,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl } from './media.js';
import { captureServerError } from './monitoring.js';
import { notifyPeople } from './notify.js';
import { stripControls } from './text.js';

/** O que aparece no lugar de uma mensagem que a equipe tirou da conversa. */
export const HIDDEN_BODY = 'Mensagem removida pela moderação.';

const BLOCKED_MESSAGE =
  'Não dá para combinar venda, preço ou Pix por aqui. A adoção é sempre gratuita e o app não recebe dinheiro. A equipe foi avisada desta tentativa.';

/** Conversa parada há mais tempo que isso sai do banco (menos as que a equipe está revendo). */
export const CHAT_RETENTION_DAYS = 180;

/**
 * Texto que vai para o banco e o que o filtro achou nele. Venda e Pix voltam com
 * `blocked: true`: a mensagem é guardada só para a equipe e não chega à outra pessoa.
 */
export function prepareAdoptionMessage(raw: string): { body: string; scan: ChatScan } {
  const body = stripControls(raw).trim();
  if (body.length < 1 || body.length > 500) {
    throw new HttpError(400, 'Escreva uma mensagem de até 500 caracteres.');
  }
  return { body, scan: scanChatMessage(body) };
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
  last_hidden: boolean | null;
  last_at: Date | null;
  closed_at: Date | null;
}

interface MessageRow {
  id: string;
  body: string;
  created_at: Date;
  sender_id: string;
  hidden_at: Date | null;
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

async function noticeAccepted(pool: Pool, userId: string): Promise<boolean> {
  const result = await pool.query<{ version: number | null }>(
    `SELECT chat_notice_version AS version FROM users WHERE id = $1`,
    [userId],
  );
  return (result.rows[0]?.version ?? 0) >= chatNoticeVersion;
}

async function threadState(
  pool: Pool,
  postId: string,
  adopterId: string,
): Promise<{ id: string; closedAt: Date | null } | null> {
  const result = await pool.query<{ id: string; closed_at: Date | null }>(
    `SELECT id, closed_at FROM adoption_threads WHERE post_id = $1 AND adopter_id = $2`,
    [postId, adopterId],
  );
  const row = result.rows[0];
  return row ? { id: row.id, closedAt: row.closed_at } : null;
}

/** Abre (ou acha) a conversa dentro da transação. */
async function ensureThread(
  client: PoolClient,
  postId: string,
  adopterId: string,
): Promise<string> {
  const created = await client.query<{ id: string }>(
    `INSERT INTO adoption_threads (post_id, adopter_id) VALUES ($1, $2)
     ON CONFLICT (post_id, adopter_id) DO NOTHING
     RETURNING id`,
    [postId, adopterId],
  );
  if (created.rows[0]) return created.rows[0].id;
  const again = await client.query<{ id: string }>(
    `SELECT id FROM adoption_threads WHERE post_id = $1 AND adopter_id = $2`,
    [postId, adopterId],
  );
  const id = again.rows[0]?.id;
  if (!id) throw new HttpError(500, 'Não consegui abrir a conversa.');
  return id;
}

/** Marca a conversa para a equipe revisar. Uma conversa já revisada volta para a fila. */
async function flagThread(client: PoolClient, threadId: string): Promise<void> {
  await client.query(
    `UPDATE adoption_threads
     SET review_status = 'flagged', flagged_at = now()
     WHERE id = $1`,
    [threadId],
  );
}

const closedMessage = 'A equipe encerrou essa conversa por segurança.';

export function registerAdoptionChat(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: { config: object } },
): void {
  const { env, pool, writeLimit } = deps;

  // A pessoa leu e aceitou o aviso de monitoramento. Fica gravado quando e qual versão.
  app.post('/me/chat-notice', writeLimit, async (request) => {
    const user = requireUser(request.user);
    await pool.query(
      `UPDATE users SET chat_notice_at = now(), chat_notice_version = $2 WHERE id = $1`,
      [user.id, chatNoticeVersion],
    );
    return { accepted: true, version: chatNoticeVersion };
  });

  // Todas as conversas da pessoa, de qualquer animal: as que ela começou e as dos animais dela.
  app.get('/me/adoption-chats', async (request) => {
    const user = requireUser(request.user);
    const result = await pool.query<{
      id: string;
      post_id: string;
      adopter_id: string;
      author_id: string;
      animal_name: string | null;
      species: string;
      other_id: string;
      other_name: string;
      other_handle: string;
      other_avatar: string | null;
      last_body: string | null;
      last_hidden: boolean | null;
      last_at: Date | null;
      last_mine: boolean | null;
      closed_at: Date | null;
    }>(
      `SELECT t.id, t.post_id, t.adopter_id, p.author_id, an.name AS animal_name, an.species,
              o.id AS other_id, o.name AS other_name, o.handle AS other_handle,
              o.avatar_url AS other_avatar,
              m.body AS last_body, m.hidden_at IS NOT NULL AS last_hidden, m.created_at AS last_at,
              m.sender_id = $1 AS last_mine, t.closed_at
       FROM adoption_threads t
       JOIN posts p ON p.id = t.post_id AND p.hidden = false
       JOIN animals an ON an.id = p.animal_id
       JOIN users o ON o.id = CASE WHEN t.adopter_id = $1 THEN p.author_id ELSE t.adopter_id END
         AND o.deleted_at IS NULL AND o.suspended = false
       JOIN LATERAL (
         SELECT body, hidden_at, created_at, sender_id FROM adoption_messages
         WHERE thread_id = t.id AND withheld = false
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE (t.adopter_id = $1 OR p.author_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = o.id)
              OR (b.blocker_id = o.id AND b.blocked_id = $1)
         )
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [user.id],
    );
    return {
      threads: result.rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        adopterId: row.adopter_id,
        role: row.author_id === user.id ? 'author' : 'adopter',
        animalName: row.animal_name,
        species: row.species,
        lastBody: row.last_hidden ? HIDDEN_BODY : row.last_body,
        lastAt: row.last_at?.toISOString() ?? null,
        lastMine: Boolean(row.last_mine),
        closed: row.closed_at !== null,
        other: {
          id: row.other_id,
          name: row.other_name,
          handle: row.other_handle,
          avatarUrl: avatar(env, row.other_avatar),
        },
      })),
    };
  });

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
    // Conversa só com mensagem barrada não aparece: para a outra pessoa ela nunca existiu.
    const threads = await pool.query<ThreadRow>(
      `SELECT t.id, t.adopter_id, u.name, u.handle, u.avatar_url, m.body AS last_body,
              m.hidden_at IS NOT NULL AS last_hidden, m.created_at AS last_at, t.closed_at
       FROM adoption_threads t
       JOIN users u ON u.id = t.adopter_id AND u.deleted_at IS NULL AND u.suspended = false
       LEFT JOIN LATERAL (
         SELECT body, hidden_at, created_at FROM adoption_messages
         WHERE thread_id = t.id AND withheld = false
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON true
       WHERE t.post_id = $1
         AND ($2::uuid IS NULL OR t.adopter_id = $2)
         AND ($2::uuid IS NOT NULL OR m.created_at IS NOT NULL)
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
      noticeAccepted: await noticeAccepted(pool, user.id),
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
        lastBody: row.last_hidden ? HIDDEN_BODY : row.last_body,
        lastAt: row.last_at?.toISOString() ?? null,
        closed: row.closed_at !== null,
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
    const accepted = await noticeAccepted(pool, user.id);
    if (author) {
      const person = await pool.query<PersonRow>(
        `SELECT id, name, handle, avatar_url FROM users
         WHERE id = $1 AND deleted_at IS NULL AND suspended = false`,
        [adopterId],
      );
      const other = person.rows[0];
      const thread = await threadState(pool, postId, adopterId);
      if (!other || !thread) throw new HttpError(404, 'Essa conversa não existe.');
      const page = await loadMessages(pool, postId, adopterId, user.id, query.data.before);
      return {
        threadId: thread.id,
        closed: thread.closedAt !== null,
        noticeAccepted: accepted,
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
    const thread = await threadState(pool, postId, user.id);
    const page = await loadMessages(pool, postId, user.id, user.id, query.data.before);
    return {
      threadId: thread?.id ?? null,
      closed: thread?.closedAt != null,
      noticeAccepted: accepted,
      other: {
        id: post.author_id,
        name: post.author_name,
        handle: post.author_handle,
        avatarUrl: avatar(env, post.author_avatar),
      },
      ...page,
    };
  });

  app.post('/posts/:id/adoption-chats/messages', writeLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (user.suspended) throw new HttpError(403, 'Essa conta não pode enviar mensagens.');
    const postId = uuidParam(request.params);
    const parsed = z
      .object({ body: z.string(), adopterId: z.string().uuid().optional() })
      .safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, 'Confira os dados e tente de novo.');
    const { body, scan } = prepareAdoptionMessage(parsed.data.body);
    if (!(await noticeAccepted(pool, user.id))) {
      throw new HttpError(403, 'Leia e aceite o aviso da conversa antes de enviar.');
    }
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
    const existing = await threadState(pool, postId, adopterId);
    if (existing?.closedAt) throw new HttpError(403, closedMessage);
    if (!existing && author) throw new HttpError(404, 'Essa conversa não existe.');
    if (!existing && post.status !== 'for_adoption') {
      throw new HttpError(400, 'Esse animal não está mais para adoção.');
    }

    const client = await pool.connect();
    let saved: { id: string; created_at: Date };
    try {
      await client.query('BEGIN');
      const threadId = existing?.id ?? (await ensureThread(client, postId, adopterId));
      const inserted = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO adoption_messages (thread_id, sender_id, body, flags, withheld)
         VALUES ($1, $2, $3, $4::text[], $5)
         RETURNING id, created_at`,
        [threadId, user.id, body, scan.flags, scan.blocked],
      );
      const row = inserted.rows[0];
      if (!row) throw new HttpError(500, 'Não consegui enviar a mensagem.');
      saved = row;
      if (scan.flags.length > 0) await flagThread(client, threadId);
      if (!scan.blocked) {
        await client.query(`UPDATE adoption_threads SET last_message_at = $2 WHERE id = $1`, [
          threadId,
          row.created_at,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch((rollback: unknown) => {
        request.log.error({ err: rollback, where: 'chat:rollback' }, 'rollback failed');
      });
      throw error;
    } finally {
      client.release();
    }

    // Venda ou Pix: guardada para a equipe, nunca entregue. Quem escreveu recebe o motivo.
    if (scan.blocked) throw new HttpError(400, BLOCKED_MESSAGE);

    await notifyNewMessage(pool, env, { postId, adopterId, recipientId: otherId }).catch(
      (error: unknown) => {
        request.log.error({ err: error, where: 'notify:adoption-chat' }, 'best-effort step failed');
        captureServerError(error, { where: 'notify:adoption-chat' });
      },
    );
    return reply.code(201).send({
      id: saved.id,
      body,
      createdAt: saved.created_at.toISOString(),
      mine: true,
      flagged: scan.flags.length > 0,
      tip: chatFlagTip(scan.flags as ChatFlag[]),
    });
  });
}

/**
 * Aviso de mensagem nova. Se a pessoa ainda tem um aviso desta conversa sem ler, não manda
 * outro: uma conversa animada não vira dez notificações.
 */
async function notifyNewMessage(
  pool: Pool,
  env: Env,
  input: { postId: string; adopterId: string; recipientId: string },
): Promise<void> {
  const pending = await pool.query(
    `SELECT 1 FROM notifications
     WHERE user_id = $1 AND type = 'adoption_chat' AND read_at IS NULL
       AND payload->>'postId' = $2 AND payload->>'adopterId' = $3
     LIMIT 1`,
    [input.recipientId, input.postId, input.adopterId],
  );
  if ((pending.rowCount ?? 0) > 0) return;
  await notifyPeople(pool, env, [input.recipientId], 'adoption_chat', {
    title: 'Nova mensagem na adoção',
    body: 'Tem mensagem nova na conversa de adoção. Abra o app para responder.',
    postId: input.postId,
    adopterId: input.adopterId,
    route: `/chat/${input.postId}?with=${input.adopterId}`,
  });
}

/**
 * Apaga conversas paradas há mais de `CHAT_RETENTION_DAYS` dias. Conversa sinalizada ou com
 * denúncia aberta fica até a equipe decidir. Roda na varredura periódica.
 */
export async function purgeOldChats(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM adoption_threads t
     WHERE COALESCE(t.last_message_at, t.created_at) < now() - ($1::text || ' days')::interval
       AND t.review_status <> 'flagged'
       AND NOT EXISTS (
         SELECT 1 FROM reports r
         WHERE r.target_type = 'adoption_thread' AND r.target_id = t.id AND r.status = 'open'
       )`,
    [String(CHAT_RETENTION_DAYS)],
  );
  return result.rowCount ?? 0;
}

async function loadMessages(
  pool: Pool,
  postId: string,
  adopterId: string,
  viewerId: string,
  before: string | undefined,
): Promise<{
  messages: { id: string; body: string; createdAt: string; mine: boolean; removed: boolean }[];
  nextCursor: string | null;
}> {
  const result = await pool.query<MessageRow>(
    `SELECT m.id, m.body, m.created_at, m.sender_id, m.hidden_at
     FROM adoption_messages m
     JOIN adoption_threads t ON t.id = m.thread_id
     WHERE t.post_id = $1 AND t.adopter_id = $2 AND m.withheld = false
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
      body: row.hidden_at ? HIDDEN_BODY : row.body,
      createdAt: row.created_at.toISOString(),
      mine: row.sender_id === viewerId,
      removed: row.hidden_at !== null,
    })),
    nextCursor: hasMore && oldest ? oldest.created_at.toISOString() : null,
  };
}
