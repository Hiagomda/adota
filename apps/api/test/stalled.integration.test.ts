import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string, role = 'user'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city)
     VALUES ($1, $2, $2, $3, 'Belém') RETURNING id`,
    [`dev:${email}`, handle, role],
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

describe('stalled cases', () => {
  let app: FastifyInstance;

  async function publish(email: string, userId: string, urgency: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency,
        description: 'Cachorro caramelo na calçada.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  const age = (id: string, hours: number) =>
    pool.query(`UPDATE posts SET created_at = now() - make_interval(hours => $2) WHERE id = $1`, [
      id,
      hours,
    ]);

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        admin_sessions, rescue_help_offers, foster_stays, animal_links, animal_custody,
        animal_health_records, notifications, reports, help_requests, sightings, responses,
        post_media, posts, animals, blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lists quiet cases first by urgency, with the reasons', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const modId = await insertUser('mod@egua.local', 'mod', 'admin');
    const fresh = await publish('autora@egua.local', authorId, 'high');
    const urgent = await publish('autora@egua.local', authorId, 'high');
    const calm = await publish('autora@egua.local', authorId, 'low');
    const medium = await publish('autora@egua.local', authorId, 'medium');
    await age(urgent, 10);
    await age(calm, 10);
    await age(medium, 30);

    const central = await app.inject({ method: 'GET', url: '/central?stalled=true' });
    expect(central.statusCode).toBe(200);
    const body = central.json();
    expect(body.summary.stalled).toBe(2);
    expect(body.cases.map((item: { id: string }) => item.id)).toEqual([urgent, medium]);
    expect(body.cases[0].stalled.reasons).toEqual(['Sem novidade há 10 h', 'Ninguém a caminho']);

    const all = await app.inject({ method: 'GET', url: '/central' });
    const byId = new Map(all.json().cases.map((item: { id: string }) => [item.id, item]));
    expect((byId.get(fresh) as { stalled: unknown }).stalled).toBeNull();
    expect((byId.get(calm) as { stalled: unknown }).stalled).toBeNull();

    const token = await staffToken(modId);
    const panel = await app.inject({
      method: 'GET',
      url: '/admin/v1/stalled-cases',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(panel.statusCode).toBe(200);
    expect(panel.json().total).toBe(2);
    expect(panel.json().cases[0].author).toMatchObject({ handle: 'autora' });

    const outsider = await app.inject({ method: 'GET', url: '/admin/v1/stalled-cases' });
    expect(outsider.statusCode).toBe(401);
  });
});
