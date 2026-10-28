import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { notifyStatusChange, releaseHelper, remindHelper } from '../src/notify.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city)
     VALUES ($1, $2, $2, 'user', 'Belém') RETURNING id`,
    [`dev:${email}`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('reminders', () => {
  let app: FastifyInstance;

  async function rescueWithHelper(): Promise<{ postId: string; helperId: string }> {
    const authorId = await insertUser('author@egua.local', 'author');
    const helperId = await insertUser('helper@egua.local', 'helper');
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('author@egua.local'),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro preso no canal.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    const postId = created.json().id as string;
    await app.inject({
      method: 'POST',
      url: `/posts/${postId}/responses`,
      headers: auth('helper@egua.local'),
      payload: { kind: 'will_help' },
    });
    return { postId, helperId };
  }

  const notices = async (userId: string, type: string) =>
    (
      await pool.query<{ payload: { title: string; body: string } }>(
        `SELECT payload FROM notifications WHERE user_id = $1 AND type = $2`,
        [userId, type],
      )
    ).rows;

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        adoption_terms, verification_requests, notifications, reports, help_requests,
        fosters, story_views, blocks, post_follows, follows, saves, likes, comments,
        responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('libera o resgate quando quem ia ajudar sumiu por 12 horas', async () => {
    const { postId, helperId } = await rescueWithHelper();
    await pool.query(
      `UPDATE responses SET created_at = now() - interval '13 hours' WHERE post_id = $1`,
      [postId],
    );
    expect(await releaseHelper(pool, env, postId, helperId)).toBe(true);
    const post = await pool.query<{ status: string }>('SELECT status FROM posts WHERE id = $1', [
      postId,
    ]);
    expect(post.rows[0]?.status).toBe('open');
    const helpers = await pool.query(
      `SELECT 1 FROM responses WHERE post_id = $1 AND kind = 'will_help'`,
      [postId],
    );
    expect(helpers.rowCount).toBe(0);
    expect(await notices(helperId, 'help_released')).toHaveLength(1);
    const author = await pool.query<{ author_id: string }>(
      'SELECT author_id FROM posts WHERE id = $1',
      [postId],
    );
    const authorNotices = await notices(author.rows[0]?.author_id ?? '', 'help_released');
    expect(authorNotices[0]?.payload.title).toBe('Seu resgate está aberto de novo');
  });

  it('não tira quem disse "vou ajudar" há pouco nem resgate que já andou', async () => {
    const { postId, helperId } = await rescueWithHelper();
    expect(await releaseHelper(pool, env, postId, helperId)).toBe(false);
    await pool.query(
      `UPDATE responses SET created_at = now() - interval '13 hours' WHERE post_id = $1`,
      [postId],
    );
    await pool.query(`UPDATE posts SET status = 'rescued' WHERE id = $1`, [postId]);
    expect(await releaseHelper(pool, env, postId, helperId)).toBe(false);
    expect(await notices(helperId, 'help_released')).toHaveLength(0);
  });

  it('asks a helper still on the way how it went', async () => {
    const { postId, helperId } = await rescueWithHelper();
    expect(await remindHelper(pool, env, postId, helperId)).toBe(true);
    const [notice] = await notices(helperId, 'help_check');
    expect(notice?.payload.title).toBe('Conseguiu ir?');
  });

  it('stays quiet once the helper stepped back or the animal is safe', async () => {
    const { postId, helperId } = await rescueWithHelper();
    await pool.query(`UPDATE posts SET status = 'rescued' WHERE id = $1`, [postId]);
    expect(await remindHelper(pool, env, postId, helperId)).toBe(false);
    await pool.query(`UPDATE posts SET status = 'on_the_way' WHERE id = $1`, [postId]);
    await pool.query(`DELETE FROM responses WHERE post_id = $1`, [postId]);
    expect(await remindHelper(pool, env, postId, helperId)).toBe(false);
    expect(await notices(helperId, 'help_check')).toHaveLength(0);
  });

  it('tells followers to look around when nobody found the animal', async () => {
    const { postId } = await rescueWithHelper();
    const author = await pool.query<{ id: string }>(
      `SELECT author_id AS id FROM posts WHERE id = $1`,
      [postId],
    );
    await notifyStatusChange(pool, env, postId, 'not_found');
    const [notice] = await notices(author.rows[0]?.id ?? '', 'status');
    expect(notice?.payload.title).toBe('Ninguém encontrou o animal');
    expect(notice?.payload.body).toContain('agora está: Não encontrado');
    expect(notice?.payload.body).toContain('dê uma olhada');
  });
});
