import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = { authorization: 'Bearer dev:autora@egua.local' };

describe('site ao vivo', () => {
  let app: FastifyInstance;
  let authorId = '';

  async function publish(extra: Record<string, unknown>): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth,
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'medium',
        description: 'Liga pra mim no 91 99999-0000.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Travessa Quintino, 1200 · Marco · Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...extra,
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
      `INSERT INTO users (firebase_uid, name, handle, role, city, phone)
       VALUES ('dev:autora@egua.local', 'Autora Secreta', 'autora', 'user', 'Belém', '+5591999990000')
       RETURNING id`,
    );
    authorId = user.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('mostra números, atividade e cartões sem nada de quem publicou', async () => {
    const alert = await publish({ type: 'rescue_alert', name: 'Caramelo' });
    await publish({ type: 'lost', name: 'Pipoca' });
    await publish({ type: 'adoption', species: 'cat', name: 'Mimi', urgency: 'low' });
    const changed = await app.inject({
      method: 'PATCH',
      url: `/posts/${alert}/status`,
      headers: auth,
      payload: { status: 'rescued' },
    });
    expect(changed.statusCode).toBe(200);
    // Nota de diário repete o status: não vira atividade nova.
    const note = await publish({
      parentPostId: alert,
      urgency: 'low',
      description: 'Dorme no sofá.',
      media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000002.jpg` }],
    });
    expect(note).toBeTruthy();
    // Post escondido pela moderação não aparece.
    const hidden = await publish({ type: 'lost', name: 'Escondido' });
    await pool.query('UPDATE posts SET hidden = true WHERE id = $1', [hidden]);

    const response = await app.inject({ method: 'GET', url: '/stats/live' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    const live = response.json();

    expect(live.counts).toMatchObject({
      forAdoption: 1,
      lostNow: 1,
      rescued: 1,
      adopted: 0,
      alertsLast30Days: 2,
    });
    expect(live.activity.map((item: { kind: string }) => item.kind).sort()).toEqual(
      ['alert', 'for_adoption', 'lost', 'rescued'].sort(),
    );
    expect(live.lost).toHaveLength(1);
    expect(live.lost[0]).toMatchObject({ name: 'Pipoca', neighborhood: 'Marco', species: 'dog' });
    expect(live.lost[0].photo).toMatch(/^https?:\/\//);
    expect(live.forAdoption[0]).toMatchObject({ name: 'Mimi', species: 'cat' });

    const text = response.body;
    expect(text).not.toContain('Autora');
    expect(text).not.toContain('autora');
    expect(text).not.toContain('99999');
    expect(text).not.toContain('Quintino');
    expect(text).not.toContain('-48.48');
    expect(text).not.toContain('Escondido');
  });
});
