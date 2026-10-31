import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(
  email: string,
  handle: string,
  role = 'user',
  verified = false,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, verified, city)
     VALUES ($1, $2, $2, $3, $4, 'Belém') RETURNING id`,
    [`dev:${email}`, handle, role, verified],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

const answers = {
  home: 'apartment',
  safeHome: 'yes',
  otherAnimals: 'cats',
  household: 'all_agree',
  hadPets: true,
};

describe('painel da ONG', () => {
  let app: FastifyInstance;

  async function publishAdoption(email: string, userId: string, name: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        type: 'adoption',
        species: 'cat',
        size: 'small',
        urgency: 'low',
        name,
        description: 'Gatinha dócil procurando casa.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        ngo_panel_settings, adoption_interests, adoption_events, adoption_terms,
        verification_requests, notifications, reports, help_requests, fosters, story_views,
        blocks, post_follows, follows, saves, likes, comments, responses, post_media, posts,
        animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('só abre para ONG ou protetor verificado', async () => {
    await insertUser('person@egua.local', 'person');
    await insertUser('pending@egua.local', 'pending', 'ngo', false);
    for (const email of ['person@egua.local', 'pending@egua.local']) {
      const response = await app.inject({
        method: 'GET',
        url: '/me/ngo-panel',
        headers: auth(email),
      });
      expect(response.statusCode).toBe(403);
    }
    expect((await app.inject({ method: 'GET', url: '/me/ngo-panel' })).statusCode).toBe(401);
  });

  it('junta animais, fichas novas e números, sem fichas de quem foi bloqueado', async () => {
    const ngoId = await insertUser('ngo@egua.local', 'patas', 'ngo', true);
    const adopterId = await insertUser('adopter@egua.local', 'adopter');
    const blockedId = await insertUser('blocked@egua.local', 'blocked');
    await pool.query(
      `INSERT INTO verification_requests
         (user_id, organization_name, status, kind, instagram, neighborhood, decided_at)
       VALUES ($1, 'Patas de Belém', 'approved', 'ngo', 'patasdebelem', 'Marco', now())`,
      [ngoId],
    );
    const mel = await publishAdoption('ngo@egua.local', ngoId, 'Mel');
    const nina = await publishAdoption('ngo@egua.local', ngoId, 'Nina');
    const adopted = await app.inject({
      method: 'PATCH',
      url: `/posts/${nina}/status`,
      headers: auth('ngo@egua.local'),
      payload: { status: 'adopted' },
    });
    expect(adopted.statusCode).toBeLessThan(300);

    for (const email of ['adopter@egua.local', 'blocked@egua.local']) {
      const sent = await app.inject({
        method: 'POST',
        url: `/posts/${mel}/adoption-interest`,
        headers: auth(email),
        payload: answers,
      });
      expect(sent.statusCode).toBe(201);
    }
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      ngoId,
      blockedId,
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/me/ngo-panel',
      headers: auth('ngo@egua.local'),
    });
    expect(response.statusCode).toBe(200);
    const panel = response.json();
    expect(panel.org).toMatchObject({
      name: 'Patas de Belém',
      handle: 'patas',
      instagram: 'patasdebelem',
      neighborhood: 'Marco',
    });
    expect(panel.theme).toEqual({ accent: 'turquoise', tagline: null });
    expect(panel.stats).toMatchObject({
      forAdoption: 1,
      adoptedTotal: 1,
      adoptedThisMonth: 1,
      newInterests: 1,
    });
    expect(panel.animals.map((item: { post: { id: string } }) => item.post.id)).toEqual([
      mel,
      nina,
    ]);
    expect(panel.animals[0]).toMatchObject({ interests: 1, newInterests: 1 });
    expect(panel.recentInterests).toHaveLength(1);
    expect(panel.recentInterests[0]).toMatchObject({
      postId: mel,
      animal: { name: 'Mel', species: 'cat' },
      person: { id: adopterId, handle: 'adopter' },
    });
  });

  it('guarda a cor e a frase do painel', async () => {
    await insertUser('ngo@egua.local', 'patas', 'protector', true);
    const save = (payload: object) =>
      app.inject({
        method: 'PUT',
        url: '/me/ngo-panel/theme',
        headers: auth('ngo@egua.local'),
        payload,
      });
    expect((await save({ accent: '#ff0000' })).statusCode).toBe(400);
    const saved = await save({ accent: 'coral', tagline: '  Gatos do Guamá  ' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ accent: 'coral', tagline: 'Gatos do Guamá' });
    const panel = (
      await app.inject({ method: 'GET', url: '/me/ngo-panel', headers: auth('ngo@egua.local') })
    ).json();
    expect(panel.theme).toEqual({ accent: 'coral', tagline: 'Gatos do Guamá' });
  });
});
