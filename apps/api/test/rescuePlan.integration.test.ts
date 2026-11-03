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

interface Plan {
  applies: boolean;
  canManage: boolean;
  needs: { kind: string; state: string; detail: string; marked: boolean }[];
}

describe('rescue action plan', () => {
  let app: FastifyInstance;

  async function publish(email: string, userId: string, extra: Record<string, unknown> = {}) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'medium',
        description: 'Cachorro caramelo na calçada.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...extra,
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  const plan = async (postId: string, email?: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/plan`,
      headers: email ? auth(email) : {},
    });
    expect(response.statusCode).toBe(200);
    return response.json() as Plan;
  };
  const states = (value: Plan) =>
    Object.fromEntries(value.needs.map((need) => [need.kind, need.state]));
  const mark = (postId: string, kind: string, value: string, email: string) =>
    app.inject({
      method: 'PUT',
      url: `/posts/${postId}/plan/${kind}`,
      headers: auth(email),
      payload: { mark: value },
    });
  const offer = (postId: string, email: string, kind: string) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/help-offers`,
      headers: auth(email),
      payload: { kind },
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        rescue_need_marks, rescue_help_offers, foster_stays, animal_links, animal_custody,
        animal_health_records, notifications, reports, help_requests, sightings, responses,
        post_media, posts, animals, blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('builds the plan from the case and covers needs as help arrives', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    await insertUser('vet@egua.local', 'vet');
    const id = await publish('autora@egua.local', authorId, { urgency: 'high' });

    const first = await plan(id);
    expect(first.applies).toBe(true);
    expect(first.canManage).toBe(false);
    expect(states(first)).toEqual({
      check_site: 'open',
      vet: 'open',
      foster: 'open',
      food: 'open',
    });

    const going = await app.inject({
      method: 'POST',
      url: `/posts/${id}/responses`,
      headers: auth('vizinho@egua.local'),
      payload: { kind: 'will_help' },
    });
    expect(going.statusCode).toBe(201);
    const vet = await offer(id, 'vet@egua.local', 'vet');
    expect(vet.statusCode).toBe(201);
    expect(states(await plan(id))).toMatchObject({ check_site: 'covered', vet: 'offered' });

    const accepted = await app.inject({
      method: 'POST',
      url: `/help-offers/${vet.json().id}/accept`,
      headers: auth('autora@egua.local'),
    });
    expect(accepted.statusCode).toBe(200);
    expect(states(await plan(id, 'autora@egua.local'))).toMatchObject({ vet: 'covered' });

    // Já tem veterinário: outra pessoa não oferece o mesmo; repetir a própria oferta continua ok.
    const second = await offer(id, 'vizinho@egua.local', 'vet');
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toContain('já tem veterinário');
    const repeat = await offer(id, 'vet@egua.local', 'vet');
    expect(repeat.statusCode).toBe(200);

    const central = await app.inject({ method: 'GET', url: '/central' });
    const item = central.json().cases[0];
    expect(item.needs).toEqual([
      { kind: 'check_site', state: 'covered' },
      { kind: 'vet', state: 'covered' },
      { kind: 'foster', state: 'open' },
      { kind: 'food', state: 'open' },
    ]);
    expect(item.reasons).toContain('Falta lar temporário e ração');
  });

  it('lets only the author or the team mark needs', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    const id = await publish('autora@egua.local', authorId);

    const stranger = await mark(id, 'food', 'dismissed', 'vizinho@egua.local');
    expect(stranger.statusCode).toBe(403);

    const dismissed = await mark(id, 'food', 'dismissed', 'autora@egua.local');
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json().canManage).toBe(true);
    const added = await mark(id, 'supplies', 'needed', 'autora@egua.local');
    expect(states(added.json())).toEqual({
      check_site: 'open',
      foster: 'open',
      food: 'dismissed',
      supplies: 'open',
    });

    const food = await offer(id, 'vizinho@egua.local', 'food');
    expect(food.statusCode).toBe(409);
    expect(food.json().message).toContain('não precisa de ração');

    const reset = await mark(id, 'food', 'auto', 'autora@egua.local');
    expect(states(reset.json())).toHaveProperty('food', 'open');
    expect((await offer(id, 'vizinho@egua.local', 'food')).statusCode).toBe(201);

    const bad = await mark(id, 'transport', 'covered', 'autora@egua.local');
    expect(bad.statusCode).toBe(404);
  });

  it('has no plan once the animal is in a home', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const id = await publish('autora@egua.local', authorId, { type: 'lost' });
    const lost = await plan(id);
    expect(lost).toMatchObject({ applies: false, needs: [] });
    const refused = await mark(id, 'food', 'covered', 'autora@egua.local');
    expect(refused.statusCode).toBe(400);
  });
});
