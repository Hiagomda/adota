import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { rescueOutcomes } from '../src/staff/moderation.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = { authorization: 'Bearer dev:autora@egua.local' };

describe('números dos resgates', () => {
  let app: FastifyInstance;
  let authorId = '';

  async function publish(): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth,
      payload: {
        species: 'cat',
        size: 'small',
        urgency: 'medium',
        description: 'Gatinho no telhado.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Umarizal, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(created.statusCode).toBe(201);
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
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ('dev:autora@egua.local', 'Autora', 'autora', 'user', 'Belém') RETURNING id`,
    );
    authorId = user.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('conta quantos avisos chegaram a um lugar seguro e em quanto tempo', async () => {
    const safe = await publish();
    await publish();
    // O aviso foi publicado 6 horas antes de ficar seguro.
    await pool.query(`UPDATE posts SET created_at = now() - interval '6 hours' WHERE id = $1`, [
      safe,
    ]);
    const changed = await app.inject({
      method: 'PATCH',
      url: `/posts/${safe}/status`,
      headers: auth,
      payload: { status: 'rescued' },
    });
    expect(changed.statusCode).toBe(200);

    const numbers = await rescueOutcomes(pool);
    expect(numbers.created).toBe(2);
    expect(numbers.safe).toBe(1);
    expect(numbers.stillOpen).toBe(1);
    expect(numbers.notFound).toBe(0);
    expect(numbers.medianHoursToSafe).toBeCloseTo(6, 0);
  });

  it('sem avisos, a mediana fica vazia', async () => {
    const numbers = await rescueOutcomes(pool);
    expect(numbers).toEqual({
      created: 0,
      safe: 0,
      stillOpen: 0,
      notFound: 0,
      medianHoursToSafe: null,
    });
  });
});
