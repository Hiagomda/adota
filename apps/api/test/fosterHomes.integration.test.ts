import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { stayDays } from '../src/fosterHomes.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });
const rescuePoint = { latitude: -1.45234, longitude: -48.48321 };

async function insertUser(email: string, handle: string, extra = ''): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, phone, whatsapp_opt_in)
     VALUES ($1, $2, $2, 'user', 'Belém', ${extra ? `'${extra}'` : 'NULL'}, ${extra ? 'true' : 'false'})
     RETURNING id`,
    [`dev:${email}`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

/** A casa fica a uns 2,4 km do resgate. */
async function placeHome(userId: string) {
  await pool.query(
    `UPDATE users SET base_location = ST_SetSRID(ST_MakePoint(-48.4700, -1.4350), 4326)::geography
     WHERE id = $1`,
    [userId],
  );
}

const homeSettings = {
  isFosterAvailable: true,
  fosterPetTypes: ['dog'],
  fosterSizes: ['medium', 'large'],
  fosterMaxDays: 15,
  capacity: 1,
  acceptsSpecialNeeds: true,
  offers: ['food', 'supplies'],
  notes: 'Tenho quintal cercado.',
  serviceRadiusKm: 10,
};

describe('Casas Amigas', () => {
  let app: FastifyInstance;

  async function rescue(email: string, userId: string, extra: Record<string, unknown> = {}) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro precisa de um canto.',
        ...rescuePoint,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...extra,
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  const saveHome = (email: string, settings: Record<string, unknown> = homeSettings) =>
    app.inject({ method: 'PUT', url: '/me/casa-amiga', headers: auth(email), payload: settings });

  const ask = (postId: string, email: string, fosterId: string) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/foster-requests`,
      headers: auth(email),
      payload: { fosterId, message: 'Pode acolher por uma semana?', expectedDays: 7 },
    });

  const act = (stayId: string, action: string, email: string) =>
    app.inject({ method: 'POST', url: `/foster-stays/${stayId}/${action}`, headers: auth(email) });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        foster_stays, animal_links, animal_custody, animal_health_records, volunteer_profiles,
        user_xp_history, user_badges, notifications, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lists homes only to who can see the rescue, in whole km and by species and size', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const homeId = await insertUser('casa@egua.local', 'casa');
    await insertUser('vizinho@egua.local', 'vizinho');
    const smallOnly = await insertUser('pequenos@egua.local', 'pequenos');
    await placeHome(homeId);
    expect((await saveHome('casa@egua.local')).statusCode).toBe(200);
    await saveHome('pequenos@egua.local', { ...homeSettings, fosterSizes: ['small'] });
    const postId = await rescue('autora@egua.local', authorId);

    const visitor = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/foster-options`,
      headers: auth('vizinho@egua.local'),
    });
    expect(visitor.json().homes).toEqual([]);

    const author = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/foster-options`,
      headers: auth('autora@egua.local'),
    });
    const homes = author.json().homes;
    expect(homes.map((home: { id: string }) => home.id)).toEqual([homeId]);
    expect(homes[0].distanceKm).toBe(2);
    expect(Number.isInteger(homes[0].distanceKm)).toBe(true);
    expect(homes[0].freeSlots).toBe(1);
    expect(homes[0].offers).toEqual(['food', 'supplies']);
    expect(JSON.stringify(homes[0])).not.toContain('-48.47');
    expect(homes.some((home: { id: string }) => home.id === smallOnly)).toBe(false);
  });

  it('runs a stay from request to end, moving the rescue and recording XP', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora', '5591988887777');
    const homeId = await insertUser('casa@egua.local', 'casa', '5591977776666');
    await saveHome('casa@egua.local');
    const postId = await rescue('autora@egua.local', authorId);

    const requested = await ask(postId, 'autora@egua.local', homeId);
    expect(requested.statusCode).toBe(201);
    expect((await ask(postId, 'autora@egua.local', homeId)).statusCode).toBe(409);
    const notice = await pool.query<{ payload: { route: string } }>(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'foster_request'`,
      [homeId],
    );
    expect(notice.rows[0]?.payload.route).toBe('/casa-amiga');

    const stayId = requested.json().id as string;
    expect((await act(stayId, 'approve', 'autora@egua.local')).statusCode).toBe(409);
    const approved = await act(stayId, 'approve', 'casa@egua.local');
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({ status: 'approved', postStatusChanged: true });

    const post = await app.inject({ method: 'GET', url: `/posts/${postId}` });
    expect(post.json().status).toBe('fostered');
    const custody = await pool.query<{ user_id: string; ended_at: Date | null }>(
      `SELECT user_id, ended_at FROM animal_custody WHERE kind = 'foster'`,
    );
    expect(custody.rows).toEqual([{ user_id: homeId, ended_at: null }]);

    const contact = await app.inject({
      method: 'POST',
      url: `/foster-stays/${stayId}/contact`,
      headers: auth('autora@egua.local'),
    });
    expect(contact.json().phone).toBe('5591977776666');

    const mine = (
      await app.inject({ method: 'GET', url: '/me/casa-amiga', headers: auth('casa@egua.local') })
    ).json();
    expect(mine.slots).toEqual({ capacity: 1, occupied: 1, free: 0 });
    expect(mine.received[0].status).toBe('approved');
    const lower = await saveHome('casa@egua.local', { ...homeSettings, capacity: 1 });
    expect(lower.statusCode).toBe(200);

    const ended = await act(stayId, 'end', 'casa@egua.local');
    expect(ended.statusCode).toBe(200);
    expect((await act(stayId, 'end', 'casa@egua.local')).statusCode).toBe(409);
    const closed = await pool.query<{ ended_at: Date | null }>(
      `SELECT ended_at FROM animal_custody WHERE kind = 'foster'`,
    );
    expect(closed.rows[0]?.ended_at).not.toBeNull();
    const xp = await pool.query<{ points: number; source_id: string }>(
      `SELECT points, source_id FROM user_xp_history WHERE user_id = $1`,
      [homeId],
    );
    expect(xp.rows).toEqual([{ points: 100, source_id: `foster-stay:${stayId}` }]);
    const badge = await pool.query(
      `SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_code = 'open_doors'`,
      [homeId],
    );
    expect(badge.rowCount).toBe(1);
  });

  it('never goes over capacity when two approvals race', async () => {
    const aliceId = await insertUser('alice@egua.local', 'alice');
    const bobId = await insertUser('bob@egua.local', 'bob');
    const homeId = await insertUser('casa@egua.local', 'casa');
    await saveHome('casa@egua.local');
    const first = await rescue('alice@egua.local', aliceId);
    const second = await rescue('bob@egua.local', bobId);
    const a = (await ask(first, 'alice@egua.local', homeId)).json().id as string;
    const b = (await ask(second, 'bob@egua.local', homeId)).json().id as string;

    const results = await Promise.all([
      act(a, 'approve', 'casa@egua.local'),
      act(b, 'approve', 'casa@egua.local'),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    const approved = await pool.query(`SELECT 1 FROM foster_stays WHERE status = 'approved'`);
    expect(approved.rowCount).toBe(1);

    // Com a casa cheia, a lista não oferece mais essa casa a quem ainda não pediu.
    const carolId = await insertUser('carol@egua.local', 'carol');
    const third = await rescue('carol@egua.local', carolId);
    const options = await app.inject({
      method: 'GET',
      url: `/posts/${third}/foster-options`,
      headers: auth('carol@egua.local'),
    });
    expect(options.json().homes).toEqual([]);
    expect((await ask(third, 'carol@egua.local', homeId)).statusCode).toBe(409);
    expect(
      (await saveHome('casa@egua.local', { ...homeSettings, capacity: 1, isFosterAvailable: true }))
        .statusCode,
    ).toBe(200);
  });

  it('lets the requester cancel and the home decline, and hides stays from strangers', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const homeId = await insertUser('casa@egua.local', 'casa');
    await insertUser('estranho@egua.local', 'estranho');
    await saveHome('casa@egua.local', { ...homeSettings, capacity: 3 });
    const postId = await rescue('autora@egua.local', authorId);

    const first = (await ask(postId, 'autora@egua.local', homeId)).json().id as string;
    expect((await act(first, 'cancel', 'estranho@egua.local')).statusCode).toBe(404);
    expect((await act(first, 'cancel', 'casa@egua.local')).statusCode).toBe(409);
    expect((await act(first, 'cancel', 'autora@egua.local')).statusCode).toBe(200);

    const second = (await ask(postId, 'autora@egua.local', homeId)).json().id as string;
    const declined = await act(second, 'decline', 'casa@egua.local');
    expect(declined.json().status).toBe('declined');
    const notice = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'foster_stay'`,
      [authorId],
    );
    expect(notice.rowCount).toBe(1);
  });

  it('refuses a lost pet and a home that does not take the size', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const homeId = await insertUser('casa@egua.local', 'casa');
    await saveHome('casa@egua.local');
    const lost = await rescue('autora@egua.local', authorId, { type: 'lost' });
    expect((await ask(lost, 'autora@egua.local', homeId)).statusCode).toBe(400);
    const small = await rescue('autora@egua.local', authorId, { size: 'small' });
    expect((await ask(small, 'autora@egua.local', homeId)).statusCode).toBe(409);
  });

  it('counts at least one day of foster care', () => {
    const start = new Date('2026-10-01T10:00:00Z');
    expect(stayDays(start, new Date('2026-10-01T11:00:00Z'))).toBe(1);
    expect(stayDays(start, new Date('2026-10-08T10:00:00Z'))).toBe(7);
    expect(stayDays(start, new Date('2027-10-01T10:00:00Z'))).toBe(90);
  });
});
