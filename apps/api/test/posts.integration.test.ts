import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
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
    [`dev:${email}`, handle, handle, role],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

async function createAlert(
  app: FastifyInstance,
  email: string,
  description: string,
  latitude = -1.45234,
  longitude = -48.48321,
) {
  return app.inject({
    method: 'POST',
    url: '/posts',
    headers: { authorization: `Bearer dev:${email}` },
    payload: {
      species: 'dog',
      size: 'medium',
      urgency: 'high',
      description,
      latitude,
      longitude,
      approxLabel: 'Nazaré, Belém',
      media: [{ url: 'https://images.dog.ceo/breeds/kelpie/n02105412_545.jpg' }],
    },
  });
}

describe('posts', () => {
  let app: FastifyInstance;

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

  it('keeps a post inside a radius and drops one outside it', async () => {
    await insertUser('near@egua.local', 'near');
    const created = await createAlert(app, 'near@egua.local', 'Cachorro na calçada.');
    expect(created.statusCode).toBe(201);

    const inside = await app.inject({
      method: 'GET',
      url: '/posts?latitude=-1.45234&longitude=-48.48321&radiusKm=1',
    });
    expect(inside.statusCode).toBe(200);
    expect(inside.json().posts).toHaveLength(1);

    const outside = await app.inject({
      method: 'GET',
      url: '/posts?latitude=-1.2&longitude=-48.2&radiusKm=1',
    });
    expect(outside.json().posts).toHaveLength(0);
  });

  it('hides the exact point until someone commits to help', async () => {
    await insertUser('author@egua.local', 'author');
    await insertUser('helper@egua.local', 'helper');
    const created = await createAlert(app, 'author@egua.local', 'Filhote sozinho.');
    const postId = created.json().id as string;

    const stranger = await app.inject({ method: 'GET', url: `/posts/${postId}` });
    const publicLocation = stranger.json().location;
    expect(publicLocation.exact).toBe(false);
    expect(publicLocation.latitude).not.toBeCloseTo(-1.45234, 4);

    const author = await app.inject({
      method: 'GET',
      url: `/posts/${postId}`,
      headers: { authorization: 'Bearer dev:author@egua.local' },
    });
    expect(author.json().location.exact).toBe(true);
    expect(author.json().location.latitude).toBeCloseTo(-1.45234, 4);

    const help = await app.inject({
      method: 'POST',
      url: `/posts/${postId}/responses`,
      headers: { authorization: 'Bearer dev:helper@egua.local' },
      payload: { kind: 'will_help' },
    });
    expect(help.statusCode).toBe(201);

    const helperView = await app.inject({
      method: 'GET',
      url: `/posts/${postId}`,
      headers: { authorization: 'Bearer dev:helper@egua.local' },
    });
    expect(helperView.json().location.exact).toBe(true);
    expect(helperView.json().status).toBe('on_the_way');

    const duplicate = await app.inject({
      method: 'POST',
      url: `/posts/${postId}/responses`,
      headers: { authorization: 'Bearer dev:helper@egua.local' },
      payload: { kind: 'will_help' },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it('rejects an invalid status jump and a forbidden species', async () => {
    await insertUser('author@egua.local', 'author');
    const created = await createAlert(app, 'author@egua.local', 'Cadela na praça.');
    const postId = created.json().id as string;

    const jump = await app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: { authorization: 'Bearer dev:author@egua.local' },
      payload: { status: 'adopted' },
    });
    expect(jump.statusCode).toBe(400);

    const step = await app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: { authorization: 'Bearer dev:author@egua.local' },
      payload: { status: 'on_the_way' },
    });
    expect(step.statusCode).toBe(200);
    const updates = await pool.query(
      `SELECT count(*)::int AS total FROM posts WHERE parent_post_id = $1`,
      [postId],
    );
    expect(updates.rows[0]?.total).toBe(1);

    await expect(
      pool.query(`INSERT INTO animals (species, size, status) VALUES ('bird', 'small', 'open')`),
    ).rejects.toThrow(/check constraint|violates/i);
  });

  it('holds sale wording for review and hides a blocked author', async () => {
    await insertUser('seller@egua.local', 'seller');
    await insertUser('reader@egua.local', 'reader');
    const created = await createAlert(app, 'seller@egua.local', 'vendo esse cachorro por R$ 200');
    expect(created.json().reviewStatus).toBe('pending');

    const feed = await app.inject({ method: 'GET', url: '/posts' });
    expect(feed.json().posts).toHaveLength(0);

    await pool.query(`UPDATE posts SET review_status = 'published' WHERE id = $1`, [
      created.json().id,
    ]);
    const seller = await pool.query<{ id: string }>(`SELECT id FROM users WHERE handle = 'seller'`);
    const reader = await pool.query<{ id: string }>(`SELECT id FROM users WHERE handle = 'reader'`);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      reader.rows[0]?.id,
      seller.rows[0]?.id,
    ]);

    const blocked = await app.inject({
      method: 'GET',
      url: '/posts',
      headers: { authorization: 'Bearer dev:reader@egua.local' },
    });
    expect(blocked.json().posts).toHaveLength(0);

    const open = await app.inject({ method: 'GET', url: '/posts' });
    expect(open.json().posts).toHaveLength(1);
  });
});
