import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { purgeOldChats } from '../src/adoptionChat.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function insertUser(email: string, handle: string, role = 'user'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city)
     VALUES ($1, $2, $3, $4, 'Belém') RETURNING id`,
    [`dev:${email}`, `${handle} Silva`, handle, role],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

async function staffToken(userId: string): Promise<string> {
  const token = `adm.teste-${userId}`;
  await pool.query(
    `INSERT INTO admin_sessions (user_id, token_hash, csrf_hash, expires_at, idle_expires_at)
     VALUES ($1, $2, 'x', now() + interval '1 hour', now() + interval '30 minutes')`,
    [userId, createHash('sha256').update(token).digest('hex')],
  );
  return token;
}

const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

describe('conversa de adoção monitorada', () => {
  let app: FastifyInstance;
  let postId: string;
  let adopterId: string;
  let authorId: string;

  const send = (email: string, body: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/adoption-chats/messages`,
      headers: auth(email),
      payload: { body, ...extra },
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE adoption_messages, adoption_threads, audit_events, admin_sessions,
        notifications, reports, blocks, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
    authorId = await insertUser('author@egua.local', 'author');
    adopterId = await insertUser('adopter@egua.local', 'adopter');
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('author@egua.local'),
      payload: {
        type: 'adoption',
        species: 'cat',
        size: 'small',
        urgency: 'low',
        description: 'Gatinha dócil procurando casa.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(created.statusCode).toBe(201);
    postId = created.json().id as string;
    await pool.query(`UPDATE posts SET status = 'for_adoption' WHERE id = $1`, [postId]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('pede o aviso, barra venda, sinaliza o resto e mostra tudo para a equipe', async () => {
    // Sem aceitar o aviso de monitoramento, nada sai.
    expect((await send('adopter@egua.local', 'Oi! Ela ainda está para adoção?')).statusCode).toBe(
      403,
    );
    for (const email of ['adopter@egua.local', 'author@egua.local']) {
      const accepted = await app.inject({
        method: 'POST',
        url: '/me/chat-notice',
        headers: auth(email),
      });
      expect(accepted.statusCode).toBe(200);
    }

    // Venda e Pix: a outra pessoa nunca vê, a equipe vê.
    const sale = await send('adopter@egua.local', 'quanto custa? te mando o pix');
    expect(sale.statusCode).toBe(400);
    expect(sale.json().message).toMatch(/Pix/);
    const authorList = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/adoption-chats`,
      headers: auth('author@egua.local'),
    });
    expect(authorList.json().threads).toEqual([]);

    // Conversa normal chega e avisa quem cuida.
    expect((await send('adopter@egua.local', 'Oi! Ela ainda está para adoção?')).statusCode).toBe(
      201,
    );
    // Contato fora do app chega, mas vai para a fila com uma dica.
    const outside = await send('adopter@egua.local', 'me chama no zap 91 98888-7777');
    expect(outside.statusCode).toBe(201);
    expect(outside.json()).toMatchObject({ flagged: true, tip: expect.stringMatching(/visita/) });

    const notices = await pool.query(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'adoption_chat'`,
      [authorId],
    );
    // Duas mensagens seguidas sem ler viram um aviso só.
    expect(notices.rows).toHaveLength(1);
    expect(notices.rows[0]?.payload).toMatchObject({ postId, adopterId });

    const page = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/adoption-chats/messages?adopterId=${adopterId}`,
      headers: auth('author@egua.local'),
    });
    expect(page.statusCode).toBe(200);
    expect(page.json().messages.map((m: { body: string }) => m.body)).toEqual([
      'Oi! Ela ainda está para adoção?',
      'me chama no zap 91 98888-7777',
    ]);
    const threadId = page.json().threadId as string;

    // Quem está na conversa denuncia; quem não está, não.
    await insertUser('stranger@egua.local', 'stranger');
    const report = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/reports',
        headers: auth(email),
        payload: {
          targetType: 'adoption_thread',
          targetId: threadId,
          reason: 'Golpe ou Pix falso',
        },
      });
    expect((await report('stranger@egua.local')).statusCode).toBe(404);
    expect((await report('author@egua.local')).statusCode).toBe(201);

    // Painel: fila de sinalizadas, conversa inteira (com a barrada) e encerramento.
    const staffId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const token = await staffToken(staffId);
    const panel = { authorization: `Bearer ${token}` };
    const queue = await app.inject({ method: 'GET', url: '/admin/v1/chats', headers: panel });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().chats).toHaveLength(1);
    expect(queue.json().chats[0]).toMatchObject({
      reviewStatus: 'flagged',
      withheld: 1,
      openReports: 1,
      flags: expect.arrayContaining(['sale', 'money', 'external_contact']),
    });
    const overview = await app.inject({ method: 'GET', url: '/admin/v1/overview', headers: panel });
    expect(overview.json().flaggedChats).toBe(1);

    const full = await app.inject({
      method: 'GET',
      url: `/admin/v1/chats/${threadId}`,
      headers: panel,
    });
    expect(full.json().messages).toHaveLength(3);
    expect(full.json().messages[0]).toMatchObject({ from: 'adopter', withheld: true });
    const audit = await pool.query(`SELECT action FROM audit_events WHERE action = 'chat.read'`);
    expect(audit.rowCount).toBe(1);

    const flaggedMessage = full.json().messages[2].id as string;
    const hide = await app.inject({
      method: 'POST',
      url: `/admin/v1/chats/${threadId}/hide`,
      headers: panel,
      payload: {
        messageId: flaggedMessage,
        hidden: true,
        justification: 'Telefone exposto na conversa.',
      },
    });
    expect(hide.statusCode).toBe(200);
    const afterHide = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/adoption-chats/messages`,
      headers: auth('adopter@egua.local'),
    });
    expect(afterHide.json().messages[1]).toMatchObject({
      body: 'Mensagem removida pela moderação.',
      removed: true,
    });

    const close = await app.inject({
      method: 'POST',
      url: `/admin/v1/chats/${threadId}/review`,
      headers: panel,
      payload: { action: 'close', justification: 'Tentativa de venda do animal.' },
    });
    expect(close.statusCode).toBe(200);
    expect((await send('adopter@egua.local', 'Oi de novo')).statusCode).toBe(403);
    const reports = await pool.query(`SELECT status FROM reports`);
    expect(reports.rows[0]?.status).toBe('hidden');

    // Nada é apagado enquanto a conversa está em revisão; depois de revisada e velha, sai.
    await pool.query(
      `UPDATE adoption_threads SET last_message_at = now() - interval '200 days', review_status = 'flagged'`,
    );
    expect(await purgeOldChats(pool)).toBe(0);
    await pool.query(`UPDATE adoption_threads SET review_status = 'reviewed'`);
    expect(await purgeOldChats(pool)).toBe(1);
  });

  it('a lista de conversas da pessoa junta as de todos os animais', async () => {
    await pool.query(`UPDATE users SET chat_notice_version = 1`);
    await send('adopter@egua.local', 'Posso conhecer ela no sábado?');
    const mine = await app.inject({
      method: 'GET',
      url: '/me/adoption-chats',
      headers: auth('author@egua.local'),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().threads).toEqual([
      expect.objectContaining({
        postId,
        adopterId,
        role: 'author',
        lastBody: 'Posso conhecer ela no sábado?',
        other: expect.objectContaining({ handle: 'adopter' }),
      }),
    ]);
  });
});
