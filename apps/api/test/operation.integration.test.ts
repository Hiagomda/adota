import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city)
     VALUES ($1, $2, $3, 'user', 'Belém') RETURNING id`,
    [`dev:${email}`, `${handle} Silva`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('rescue operation mode', () => {
  let app: FastifyInstance;

  async function publish(email: string, userId: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
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

  const step = (id: string, name: string, email: string, payload?: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/posts/${id}/operation/${name}`,
      headers: auth(email),
      ...(payload ? { payload } : {}),
    });
  const state = async (id: string, email: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/posts/${id}/operation`,
      headers: auth(email),
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  const help = (id: string, email: string) =>
    app.inject({
      method: 'POST',
      url: `/posts/${id}/responses`,
      headers: auth(email),
      payload: { kind: 'will_help' },
    });
  const diary = async (id: string) =>
    (
      await pool.query<{ description: string }>(
        'SELECT description FROM posts WHERE parent_post_id = $1 ORDER BY created_at',
        [id],
      )
    ).rows.map((row) => row.description);

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        rescue_operations, rescue_help_offers, foster_stays, animal_links, animal_custody,
        animal_health_records, notifications, reports, help_requests, sightings, responses,
        post_media, posts, animals, blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('walks the steps once, writes the diary and finishes with a summary', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    await insertUser('amiga@egua.local', 'amiga');
    const id = await publish('autora@egua.local', authorId);

    // Sem "vou ajudar" não dá para seguir os passos.
    expect((await step(id, 'departed', 'vizinho@egua.local')).statusCode).toBe(403);
    expect((await state(id, 'vizinho@egua.local')).canOperate).toBe(false);

    expect((await help(id, 'vizinho@egua.local')).statusCode).toBe(201);
    expect((await help(id, 'amiga@egua.local')).statusCode).toBe(201);
    expect((await state(id, 'vizinho@egua.local')).canOperate).toBe(true);

    expect((await step(id, 'departed', 'vizinho@egua.local')).statusCode).toBe(200);
    await step(id, 'departed', 'vizinho@egua.local');
    const arrived = await step(id, 'arrived', 'vizinho@egua.local');
    expect(arrived.statusCode).toBe(200);
    await step(id, 'arrived', 'vizinho@egua.local');
    expect(arrived.json().operation.arrivedAt).not.toBeNull();
    expect(arrived.json().team).toEqual([{ name: 'amiga', departedAt: null, arrivedAt: null }]);
    expect((await diary(id)).filter((note) => note === 'Cheguei ao local.')).toHaveLength(1);

    const friend = await state(id, 'amiga@egua.local');
    expect(friend.team[0]).toMatchObject({ name: 'vizinho' });
    expect(friend.team[0].arrivedAt).not.toBeNull();

    const authorNotes = await pool.query(
      `SELECT payload->>'title' AS title FROM notifications WHERE user_id = $1 ORDER BY created_at`,
      [authorId],
    );
    expect(authorNotes.rows.map((row) => row.title)).toEqual([
      'Alguém saiu para ajudar',
      'Diário do resgate',
    ]);

    // Encontrou: primeiro muda o status pelo caminho de sempre, depois fecha com o resumo.
    const early = await step(id, 'finish', 'vizinho@egua.local', { outcome: 'found' });
    expect(early.statusCode).toBe(400);
    const status = await app.inject({
      method: 'PATCH',
      url: `/posts/${id}/status`,
      headers: auth('vizinho@egua.local'),
      payload: { status: 'rescued' },
    });
    expect(status.statusCode).toBe(200);
    const done = await step(id, 'finish', 'vizinho@egua.local', {
      outcome: 'found',
      summary: 'Estava assustado mas bem. Levei para casa.',
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ canOperate: false, operation: { outcome: 'found' } });
    await step(id, 'finish', 'vizinho@egua.local', { outcome: 'found', summary: 'De novo' });
    const notes = await diary(id);
    expect(notes.filter((note) => note.startsWith('Resumo do atendimento'))).toEqual([
      'Resumo do atendimento: Estava assustado mas bem. Levei para casa.',
    ]);
  });

  it('leaves the rescue when the animal was not found', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    const id = await publish('autora@egua.local', authorId);
    await help(id, 'vizinho@egua.local');
    await step(id, 'arrived', 'vizinho@egua.local');

    const finished = await step(id, 'finish', 'vizinho@egua.local', { outcome: 'not_found' });
    expect(finished.statusCode).toBe(200);
    expect(finished.json()).toMatchObject({
      status: 'not_found',
      willHelp: false,
      canOperate: false,
      operation: { outcome: 'not_found' },
    });
    const post = await pool.query('SELECT status FROM posts WHERE id = $1', [id]);
    expect(post.rows[0]?.status).toBe('not_found');
  });
});
