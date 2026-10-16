import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { anonymizeUser } from '../src/accounts.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });
const seen = { latitude: -1.44871, longitude: -48.48912 };

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

describe('sightings', () => {
  let app: FastifyInstance;

  async function rescue(): Promise<string> {
    const authorId = await insertUser('author@egua.local', 'author');
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('author@egua.local'),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro assustado na praça.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    return created.json().id as string;
  }

  const sight = (postId: string, email: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/sightings`,
      headers: auth(email),
      payload: { ...seen, note: 'Estava perto da padaria.', ...extra },
    });

  const list = (postId: string, email?: string) =>
    app.inject({
      method: 'GET',
      url: `/posts/${postId}/sightings`,
      headers: email ? auth(email) : {},
    });

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

  it('records a sighting, tells the author and shows the exact point only to them', async () => {
    const postId = await rescue();
    await insertUser('passerby@egua.local', 'passerby');
    expect((await sight(postId, 'passerby@egua.local')).statusCode).toBe(201);

    const forAuthor = (await list(postId, 'author@egua.local')).json().sightings;
    expect(forAuthor).toHaveLength(1);
    expect(forAuthor[0].note).toBe('Estava perto da padaria.');
    expect(forAuthor[0].location).toEqual({ ...seen, exact: true });

    const forAll = (await list(postId)).json().sightings;
    expect(forAll[0].location.exact).toBe(false);
    expect(forAll[0].location.latitude).not.toBe(seen.latitude);

    const notice = await pool.query(
      `SELECT payload FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.handle = 'author' AND n.type = 'sighting'`,
    );
    expect(notice.rowCount).toBe(1);
  });

  it('refuses a point outside Belém, a safe animal and too many marks a day', async () => {
    const postId = await rescue();
    await insertUser('passerby@egua.local', 'passerby');
    expect(
      (await sight(postId, 'passerby@egua.local', { latitude: -23.55, longitude: -46.63 }))
        .statusCode,
    ).toBe(400);
    for (let mark = 0; mark < 5; mark += 1) {
      expect((await sight(postId, 'passerby@egua.local')).statusCode).toBe(201);
    }
    expect((await sight(postId, 'passerby@egua.local')).statusCode).toBe(429);
    await pool.query(`UPDATE posts SET status = 'rescued' WHERE id = $1`, [postId]);
    await insertUser('late@egua.local', 'late');
    expect((await sight(postId, 'late@egua.local')).statusCode).toBe(409);
  });

  it('removes the sightings of a person who deletes the account', async () => {
    const postId = await rescue();
    const passerby = await insertUser('passerby@egua.local', 'passerby');
    await sight(postId, 'passerby@egua.local');
    await anonymizeUser(pool, passerby);
    const left = await pool.query(`SELECT count(*)::int AS total FROM sightings`);
    expect(left.rows[0]?.total).toBe(0);
  });
});
