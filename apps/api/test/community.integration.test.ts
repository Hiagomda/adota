import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
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

describe('community', () => {
  let app: FastifyInstance;

  async function rescue(email: string, userId: string, approxLabel: string): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro na chuva.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel,
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    return created.json().id as string;
  }

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

  it('tells the reporter when the team looks at the report', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    const reporterId = await insertUser('reporter@egua.local', 'reporter');
    await pool.query(
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ('dev:team@egua.local', 'Equipe', 'team', 'admin', 'Belém')`,
    );
    const postId = await rescue('author@egua.local', authorId, 'Marco, Belém');
    const reported = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: auth('reporter@egua.local'),
      payload: { targetType: 'post', targetId: postId, reason: 'Maus-tratos' },
    });
    expect(reported.statusCode).toBe(201);
    const report = await pool.query<{ id: string }>(`SELECT id FROM reports LIMIT 1`);
    const resolved = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report.rows[0]?.id}`,
      headers: auth('team@egua.local'),
      payload: { action: 'hide' },
    });
    expect(resolved.statusCode).toBe(200);
    const notice = await pool.query<{ payload: { body: string } }>(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'report'`,
      [reporterId],
    );
    expect(notice.rows[0]?.payload.body).toContain('tirou o conteúdo do ar');
  });

  it('keeps one photo on a diary note', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    const postId = await rescue('author@egua.local', authorId, 'Marco, Belém');
    const note = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('author@egua.local'),
      payload: {
        parentPostId: postId,
        species: 'dog',
        size: 'medium',
        urgency: 'low',
        description: 'Notícias da casa nova: dorme no sofá.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Marco, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000002.jpg` }],
      },
    });
    expect(note.statusCode).toBe(201);
    const post = (await app.inject({ method: 'GET', url: `/posts/${postId}` })).json();
    const last = post.updates[post.updates.length - 1];
    expect(last.photo.thumbUrl).toMatch(/^https?:\/\//);
    const stored = await pool.query<{ url: string }>(
      `SELECT url FROM post_media WHERE post_id = $1`,
      [last.id],
    );
    expect(stored.rows[0]?.url).toBe(
      `uploads/${authorId}/00000000-0000-4000-8000-000000000002.jpg`,
    );
  });

  it('ranks neighborhoods by animals that left the street and counts them on the profile', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    await insertUser('helper@egua.local', 'helper');
    const marco = await rescue('author@egua.local', authorId, 'Rua A · Marco · Belém');
    await rescue('author@egua.local', authorId, 'Marco, Belém');
    const nazare = await rescue('author@egua.local', authorId, 'Nazaré, Belém');
    await pool.query(`UPDATE posts SET status = 'rescued' WHERE id = ANY($1::uuid[])`, [
      [marco, nazare],
    ]);
    await pool.query(
      `INSERT INTO responses (post_id, user_id, kind)
       SELECT $1, id, 'will_help' FROM users WHERE handle = 'helper'`,
      [marco],
    );

    const ranking = (await app.inject({ method: 'GET', url: '/stats/neighborhoods' })).json();
    expect(ranking.neighborhoods).toEqual([
      { name: 'Marco', rescued: 1 },
      { name: 'Nazaré', rescued: 1 },
    ]);

    const helper = (await app.inject({ method: 'GET', url: '/users/helper' })).json();
    expect(helper.counts.rescued).toBe(1);
    const author = (await app.inject({ method: 'GET', url: '/users/author' })).json();
    expect(author.counts.rescued).toBe(2);
  });
});
