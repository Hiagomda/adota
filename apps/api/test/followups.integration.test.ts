import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { sendAdoptionCheckins } from '../src/followups.js';

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

describe('adoption check-ins', () => {
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
        name: 'Mel',
        description: 'Cachorra caramelo muito dócil.',
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

  const status = (id: string, value: string, email: string) =>
    app.inject({
      method: 'PATCH',
      url: `/posts/${id}/status`,
      headers: auth(email),
      payload: { status: value },
    });
  const followup = async (id: string, email: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/posts/${id}/followup`,
      headers: auth(email),
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  };
  const titles = async (userId: string) =>
    (
      await pool.query<{ title: string }>(
        `SELECT payload->>'title' AS title FROM notifications WHERE user_id = $1 ORDER BY created_at`,
        [userId],
      )
    ).rows.map((row) => row.title);

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        adoption_checkins, adoption_followups, adoption_interests, rescue_help_offers,
        foster_stays, animal_links, animal_custody, animal_health_records, notifications,
        reports, help_requests, sightings, responses, post_media, posts, animals, blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('follows the helper who adopted and warns the author when it gets hard', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const helperId = await insertUser('vizinho@egua.local', 'vizinho');
    const id = await publish('autora@egua.local', authorId);
    const going = await app.inject({
      method: 'POST',
      url: `/posts/${id}/responses`,
      headers: auth('vizinho@egua.local'),
      payload: { kind: 'will_help' },
    });
    expect(going.statusCode).toBe(201);
    expect((await status(id, 'adopted', 'vizinho@egua.local')).statusCode).toBe(200);

    const mine = await followup(id, 'vizinho@egua.local');
    expect(mine.role).toBe('tutor');
    expect(mine.followup.checkins.map((item: { day: number }) => item.day)).toEqual([7, 30, 90]);
    expect(mine.followup.checkins[0].due).toBe(false);
    expect(await titles(helperId)).toContain('Parabéns pela adoção!');

    // Cedo demais para responder.
    const early = await app.inject({
      method: 'POST',
      url: `/adoption-followups/${mine.followup.id}/checkins/7`,
      headers: auth('vizinho@egua.local'),
      payload: { mood: 'ok' },
    });
    expect(early.statusCode).toBe(400);

    await pool.query(
      `UPDATE adoption_followups SET adopted_at = now() - interval '8 days' WHERE post_id = $1`,
      [id],
    );
    expect(await sendAdoptionCheckins(pool, env)).toBe(1);
    expect(await sendAdoptionCheckins(pool, env)).toBe(0);
    expect(await titles(helperId)).toContain('Uma semana juntos!');

    const stranger = await app.inject({
      method: 'POST',
      url: `/adoption-followups/${mine.followup.id}/checkins/7`,
      headers: auth('autora@egua.local'),
      payload: { mood: 'great' },
    });
    expect(stranger.statusCode).toBe(404);

    const answer = await app.inject({
      method: 'POST',
      url: `/adoption-followups/${mine.followup.id}/checkins/7`,
      headers: auth('vizinho@egua.local'),
      payload: { mood: 'hard', note: 'Ela chora à noite.', wantsHelp: true },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json().followup.checkins[0]).toMatchObject({
      mood: 'hard',
      note: 'Ela chora à noite.',
      wantsHelp: true,
    });
    expect(await titles(authorId)).toContain('A adaptação precisa de atenção');

    const authorView = await followup(id, 'autora@egua.local');
    expect(authorView.role).toBe('responsible');
    expect(authorView.followup.checkins[0].mood).toBe('hard');

    // Devolução encerra o acompanhamento.
    expect((await status(id, 'for_adoption', 'autora@egua.local')).statusCode).toBe(200);
    expect((await followup(id, 'autora@egua.local')).followup.closed).toBe(true);
  });

  it('lets the author name the adopter among people who filled the form', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const adopterId = await insertUser('adotante@egua.local', 'adotante');
    const otherId = await insertUser('outra@egua.local', 'outra');
    const id = await publish('autora@egua.local', authorId, { type: 'adoption', urgency: 'low' });
    await pool.query(
      `INSERT INTO adoption_interests (post_id, user_id, answers) VALUES ($1, $2, '{}'::jsonb)`,
      [id, adopterId],
    );
    expect((await status(id, 'adopted', 'autora@egua.local')).statusCode).toBe(200);

    const before = await followup(id, 'autora@egua.local');
    expect(before).toMatchObject({ role: 'responsible', canSetAdopter: true, followup: null });
    expect(before.candidates.map((person: { handle: string }) => person.handle)).toEqual([
      'adotante',
    ]);

    const wrong = await app.inject({
      method: 'POST',
      url: `/posts/${id}/adopter`,
      headers: auth('autora@egua.local'),
      payload: { userId: otherId },
    });
    expect(wrong.statusCode).toBe(400);
    const named = await app.inject({
      method: 'POST',
      url: `/posts/${id}/adopter`,
      headers: auth('autora@egua.local'),
      payload: { userId: adopterId },
    });
    expect(named.statusCode).toBe(200);
    expect(named.json()).toMatchObject({
      canSetAdopter: false,
      followup: { tutor: { handle: 'adotante' } },
    });
    expect((await followup(id, 'adotante@egua.local')).role).toBe('tutor');
    expect((await followup(id, 'outra@egua.local')).followup).toBeNull();
  });
});
