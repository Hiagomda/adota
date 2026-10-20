import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string, role = 'user'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, phone, whatsapp_opt_in)
     VALUES ($1, $2, $2, $3, 'Belém', '91999990000', true) RETURNING id`,
    [`dev:${email}`, handle, role],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('proteções do resgate e da adoção', () => {
  let app: FastifyInstance;

  async function publish(
    email: string,
    userId: string,
    type: 'rescue_alert' | 'adoption',
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        type,
        species: 'cat',
        size: 'small',
        urgency: type === 'adoption' ? 'low' : 'high',
        description: type === 'adoption' ? 'Gatinha dócil procurando casa.' : 'Gato preso no muro.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  function respond(postId: string, email: string, kind = 'will_help') {
    return app.inject({
      method: 'POST',
      url: `/posts/${postId}/responses`,
      headers: auth(email),
      payload: { kind },
    });
  }

  function setStatus(postId: string, email: string, status: string) {
    return app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: auth(email),
      payload: { status },
    });
  }

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        adoption_messages, adoption_threads, notifications, reports, help_requests, fosters,
        story_views, blocks, post_follows, follows, saves, likes, comments, responses,
        post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('não deixa um estranho dizer "vou ajudar" num anúncio de adoção para fechar o anúncio', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('estranho@egua.local', 'estranho');
    const postId = await publish('autora@egua.local', authorId, 'adoption');

    const help = await respond(postId, 'estranho@egua.local');
    expect(help.statusCode).toBe(400);

    const adopted = await setStatus(postId, 'estranho@egua.local', 'adopted');
    expect(adopted.statusCode).toBe(403);

    const view = await app.inject({
      method: 'GET',
      url: `/posts/${postId}`,
      headers: auth('estranho@egua.local'),
    });
    expect(view.json().status).toBe('for_adoption');
    expect(view.json().location.exact).toBe(false);
    expect(view.json().author.phone).toBeNull();
  });

  it('deixa quem ajuda avançar o resgate, mas só a autora conclui a adoção', async () => {
    const authorId = await insertUser('autor@egua.local', 'autor');
    await insertUser('ajuda@egua.local', 'ajuda');
    const postId = await publish('autor@egua.local', authorId, 'rescue_alert');

    expect((await respond(postId, 'ajuda@egua.local')).statusCode).toBe(201);
    expect((await setStatus(postId, 'ajuda@egua.local', 'rescued')).statusCode).toBe(200);
    expect((await setStatus(postId, 'ajuda@egua.local', 'fostered')).statusCode).toBe(200);
    expect((await setStatus(postId, 'ajuda@egua.local', 'for_adoption')).statusCode).toBe(200);
    expect((await setStatus(postId, 'ajuda@egua.local', 'adopted')).statusCode).toBe(403);
    expect((await setStatus(postId, 'autor@egua.local', 'adopted')).statusCode).toBe(200);
  });

  it('não aceita resposta nem mudança de status num resgate oculto ou num registro do diário', async () => {
    const authorId = await insertUser('dona@egua.local', 'dona');
    await insertUser('outra@egua.local', 'outra');
    const postId = await publish('dona@egua.local', authorId, 'rescue_alert');
    expect((await respond(postId, 'outra@egua.local')).statusCode).toBe(201);
    const diary = await pool.query<{ id: string }>(
      `SELECT id FROM posts WHERE parent_post_id = $1 LIMIT 1`,
      [postId],
    );
    const diaryId = diary.rows[0]?.id;
    expect(diaryId).toBeDefined();
    expect((await respond(diaryId as string, 'outra@egua.local', 'seen')).statusCode).toBe(404);
    expect((await setStatus(diaryId as string, 'dona@egua.local', 'rescued')).statusCode).toBe(404);

    await pool.query(`UPDATE posts SET hidden = true WHERE id = $1`, [postId]);
    expect((await respond(postId, 'outra@egua.local', 'seen')).statusCode).toBe(404);
    expect((await setStatus(postId, 'outra@egua.local', 'rescued')).statusCode).toBe(404);
  });

  it('responde 404 e não 500 para um resgate que não existe', async () => {
    await insertUser('alguem@egua.local', 'alguem');
    const missing = '00000000-0000-4000-8000-0000000000aa';
    expect((await respond(missing, 'alguem@egua.local')).statusCode).toBe(404);
    for (const action of ['like', 'save', 'follow', 'story-view']) {
      const response = await app.inject({
        method: 'POST',
        url: `/posts/${missing}/${action}`,
        headers: auth('alguem@egua.local'),
      });
      expect(response.statusCode, action).toBe(404);
    }
  });

  it('não duplica a curtida quando dois toques chegam juntos', async () => {
    const authorId = await insertUser('foto@egua.local', 'foto');
    await insertUser('fa@egua.local', 'fa');
    const postId = await publish('foto@egua.local', authorId, 'rescue_alert');
    const taps = await Promise.all(
      [1, 2, 3].map(() =>
        app.inject({
          method: 'POST',
          url: `/posts/${postId}/like`,
          headers: auth('fa@egua.local'),
        }),
      ),
    );
    for (const tap of taps) expect(tap.statusCode).toBe(200);
    const likes = await pool.query(`SELECT count(*)::int AS total FROM likes WHERE post_id = $1`, [
      postId,
    ]);
    expect(likes.rows[0]?.total).toBeLessThanOrEqual(1);
  });

  it('não grava duas vezes "Animal resgatado" quando duas pessoas marcam ao mesmo tempo', async () => {
    const authorId = await insertUser('chama@egua.local', 'chama');
    await insertUser('um@egua.local', 'um');
    await insertUser('dois@egua.local', 'dois');
    const postId = await publish('chama@egua.local', authorId, 'rescue_alert');
    expect((await respond(postId, 'um@egua.local')).statusCode).toBe(201);
    expect((await respond(postId, 'dois@egua.local')).statusCode).toBe(201);

    const both = await Promise.all([
      setStatus(postId, 'um@egua.local', 'rescued'),
      setStatus(postId, 'dois@egua.local', 'rescued'),
    ]);
    expect(both.map((response) => response.statusCode).sort()).toEqual([200, 400]);
    const notes = await pool.query(
      `SELECT count(*)::int AS total FROM posts WHERE parent_post_id = $1 AND status = 'rescued'`,
      [postId],
    );
    expect(notes.rows[0]?.total).toBe(1);
  });

  it('leva o token de push do celular para a conta que entrou por último', async () => {
    const firstId = await insertUser('primeira@egua.local', 'primeira');
    const secondId = await insertUser('segunda@egua.local', 'segunda');
    const token = 'token-do-celular-compartilhado';
    for (const email of ['primeira@egua.local', 'segunda@egua.local']) {
      const saved = await app.inject({
        method: 'POST',
        url: '/me/fcm-token',
        headers: auth(email),
        payload: { token },
      });
      expect(saved.statusCode).toBe(200);
    }
    const rows = await pool.query<{ id: string; fcm_tokens: string[] }>(
      `SELECT id, fcm_tokens FROM users WHERE id = ANY($1::uuid[])`,
      [[firstId, secondId]],
    );
    const tokensOf = (id: string) => rows.rows.find((row) => row.id === id)?.fcm_tokens ?? [];
    expect(tokensOf(firstId)).not.toContain(token);
    expect(tokensOf(secondId)).toContain(token);
  });

  it('guarda só os tokens de push mais recentes de uma conta', async () => {
    const id = await insertUser('muitos@egua.local', 'muitos');
    for (let index = 0; index < 15; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/me/fcm-token',
        headers: auth('muitos@egua.local'),
        payload: { token: `aparelho-numero-${index}` },
      });
    }
    const row = await pool.query<{ fcm_tokens: string[] }>(
      `SELECT fcm_tokens FROM users WHERE id = $1`,
      [id],
    );
    const tokens = row.rows[0]?.fcm_tokens ?? [];
    expect(tokens.length).toBeLessThanOrEqual(10);
    expect(tokens).toContain('aparelho-numero-14');
    expect(tokens).not.toContain('aparelho-numero-0');
  });

  it('não repete a mesma denúncia aberta da mesma pessoa', async () => {
    const authorId = await insertUser('alvo@egua.local', 'alvo');
    await insertUser('denuncia@egua.local', 'denuncia');
    const postId = await publish('alvo@egua.local', authorId, 'rescue_alert');
    for (let index = 0; index < 3; index += 1) {
      const sent = await app.inject({
        method: 'POST',
        url: '/reports',
        headers: auth('denuncia@egua.local'),
        payload: { targetType: 'post', targetId: postId, reason: 'Parece venda de animal.' },
      });
      expect(sent.statusCode).toBe(201);
    }
    const reports = await pool.query(`SELECT count(*)::int AS total FROM reports`);
    expect(reports.rows[0]?.total).toBe(1);
  });
});
