import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function insertUser(
  email: string,
  handle: string,
  phone: string | null = null,
  role = 'user',
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, phone, whatsapp_opt_in)
     VALUES ($1, $2, $3, $4, 'Belém', $5, $6) RETURNING id`,
    [`dev:${email}`, `${handle} Silva`, handle, role, phone, phone !== null],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

async function offerHome(userId: string, petTypes: string[]) {
  await pool.query(
    `INSERT INTO volunteer_profiles (user_id, is_foster_available, foster_pet_types, foster_max_days)
     VALUES ($1, true, $2::jsonb, 7)`,
    [userId, JSON.stringify(petTypes)],
  );
}

const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

describe('contact on WhatsApp', () => {
  let app: FastifyInstance;

  async function createAlert(email: string): Promise<string> {
    const owner = await pool.query<{ id: string }>(`SELECT id FROM users WHERE firebase_uid = $1`, [
      `dev:${email}`,
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro magro perto da feira.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${owner.rows[0]?.id}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    return response.json().id as string;
  }

  const askAuthor = (postId: string, email?: string) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/contact`,
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

  it('gives the author number on an adoption to anyone signed in, if they opted in', async () => {
    await insertUser('author@egua.local', 'author', '5591988887777');
    await insertUser('adopter@egua.local', 'adopter');
    const postId = await createAlert('author@egua.local');
    await pool.query(`UPDATE posts SET status = 'for_adoption' WHERE id = $1`, [postId]);

    expect((await askAuthor(postId)).statusCode).toBe(401);
    const asked = await askAuthor(postId, 'adopter@egua.local');
    expect(asked.statusCode).toBe(200);
    expect(asked.json()).toEqual({ phone: '5591988887777' });
    expect((await askAuthor(postId, 'author@egua.local')).statusCode).toBe(403);

    await pool.query(`UPDATE users SET whatsapp_opt_in = false WHERE handle = 'author'`);
    expect((await askAuthor(postId, 'adopter@egua.local')).statusCode).toBe(404);
  });

  it('keeps a rescue number for who said vou ajudar', async () => {
    await insertUser('author@egua.local', 'author', '5591988887777');
    await insertUser('helper@egua.local', 'helper');
    const postId = await createAlert('author@egua.local');

    expect((await askAuthor(postId, 'helper@egua.local')).statusCode).toBe(403);
    const help = await app.inject({
      method: 'POST',
      url: `/posts/${postId}/responses`,
      headers: auth('helper@egua.local'),
      payload: { kind: 'will_help' },
    });
    expect(help.statusCode).toBeLessThan(300);
    expect((await askAuthor(postId, 'helper@egua.local')).json()).toEqual({
      phone: '5591988887777',
    });
  });

  it('lists Casas Amigas without address or number and hands one number at a time', async () => {
    await insertUser('author@egua.local', 'author');
    await insertUser('stranger@egua.local', 'stranger');
    const homeId = await insertUser('home@egua.local', 'home', '5591983334444');
    const catOnly = await insertUser('cats@egua.local', 'cats', '5591981112222');
    const hidden = await insertUser('hidden@egua.local', 'hidden');
    await offerHome(homeId, ['dog']);
    await offerHome(catOnly, ['cat']);
    await offerHome(hidden, ['dog']);
    const postId = await createAlert('author@egua.local');
    const list = (email: string) =>
      app.inject({ method: 'GET', url: `/posts/${postId}/foster-homes`, headers: auth(email) });

    expect((await list('stranger@egua.local')).json()).toEqual({ homes: [] });
    const homes = (await list('author@egua.local')).json().homes;
    // Only who takes dogs and shows a WhatsApp, and never the number in the list.
    expect(homes).toEqual([
      {
        id: homeId,
        name: 'home Silva',
        handle: 'home',
        verified: false,
        petTypes: ['dog'],
        maxDays: 7,
      },
    ]);

    const contact = (userId: string, email: string) =>
      app.inject({
        method: 'POST',
        url: `/posts/${postId}/foster-homes/${userId}/contact`,
        headers: auth(email),
      });
    expect((await contact(homeId, 'author@egua.local')).json()).toEqual({
      phone: '5591983334444',
    });
    expect((await contact(catOnly, 'author@egua.local')).statusCode).toBe(404);
    expect((await contact(homeId, 'stranger@egua.local')).statusCode).toBe(403);
  });

  it('tells the diary who went and did not find the animal, and counts who is still going', async () => {
    await insertUser('author@egua.local', 'author');
    await insertUser('first@egua.local', 'first');
    await insertUser('second@egua.local', 'second');
    const postId = await createAlert('author@egua.local');
    for (const email of ['first@egua.local', 'second@egua.local']) {
      await app.inject({
        method: 'POST',
        url: `/posts/${postId}/responses`,
        headers: auth(email),
        payload: { kind: 'will_help' },
      });
    }
    const left = await app.inject({
      method: 'POST',
      url: `/posts/${postId}/help/leave`,
      headers: auth('first@egua.local'),
      payload: { outcome: 'not_found' },
    });
    expect(left.statusCode).toBe(200);

    const post = (
      await app.inject({
        method: 'GET',
        url: `/posts/${postId}`,
        headers: auth('author@egua.local'),
      })
    ).json();
    expect(post.status).toBe('on_the_way');
    expect(post.helpersCount).toBe(1);
    const kinds = post.updates.map((update: { kind: string }) => update.kind);
    expect(kinds).toContain('status');
    expect(kinds[kinds.length - 1]).toBe('not_found');
  });

  it('stores the WhatsApp the way wa.me needs and returns it to its owner only', async () => {
    await insertUser('me@egua.local', 'me');
    const save = (phone: string) =>
      app.inject({
        method: 'PATCH',
        url: '/me',
        headers: auth('me@egua.local'),
        payload: { phone },
      });

    expect((await save('(91) 98888-7777')).statusCode).toBe(200);
    const me = (
      await app.inject({ method: 'GET', url: '/me', headers: auth('me@egua.local') })
    ).json();
    expect(me.phone).toBe('5591988887777');
    expect((await save('123')).statusCode).toBe(400);
  });
});
