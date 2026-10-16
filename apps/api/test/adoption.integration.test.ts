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

describe('adoption details and filters', () => {
  let app: FastifyInstance;

  async function publish(
    email: string,
    userId: string,
    extra: Record<string, unknown>,
    approxLabel = 'Nazaré, Belém',
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        type: 'adoption',
        species: 'cat',
        size: 'small',
        urgency: 'low',
        description: 'Gatinha dócil procurando casa.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel,
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...extra,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  const feed = (query: string) =>
    app.inject({ method: 'GET', url: `/posts?${query}`, headers: auth('viewer@egua.local') });

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

  it('keeps the care facts and filters adoption by them, by age and by neighborhood', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    await insertUser('viewer@egua.local', 'viewer');
    const ready = await publish('author@egua.local', authorId, {
      ageEstimate: 'filhote',
      care: { neutered: true, vaccinated: true, goodWithKids: true },
    });
    await publish(
      'author@egua.local',
      authorId,
      { ageEstimate: 'adulto', care: { neutered: false } },
      'Marco, Belém',
    );

    const post = (await app.inject({ method: 'GET', url: `/posts/${ready}` })).json();
    expect(post.animal.care).toEqual({
      neutered: true,
      vaccinated: true,
      goodWithKids: true,
      goodWithAnimals: null,
    });

    const ids = async (query: string) =>
      (await feed(query)).json().posts.map((item: { id: string }) => item.id);
    expect(await ids('status=for_adoption&neutered=true')).toEqual([ready]);
    expect(await ids('status=for_adoption&age=filhote')).toEqual([ready]);
    expect(await ids('status=for_adoption&place=naza')).toEqual([ready]);
    expect(await ids('status=for_adoption&place=100%25')).toEqual([]);
    expect(await ids('status=for_adoption')).toHaveLength(2);
  });

  it('changes only the care facts that were sent', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    const id = await publish('author@egua.local', authorId, { care: { neutered: true } });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/posts/${id}`,
      headers: auth('author@egua.local'),
      payload: {
        description: 'Gatinha dócil, já vacinada.',
        urgency: 'low',
        ageEstimate: 'adulto',
        care: { vaccinated: true },
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(patch.statusCode).toBeLessThan(300);
    const post = (await app.inject({ method: 'GET', url: `/posts/${id}` })).json();
    expect(post.animal.care.neutered).toBe(true);
    expect(post.animal.care.vaccinated).toBe(true);
    expect(post.animal.ageEstimate).toBe('adulto');
  });
});
