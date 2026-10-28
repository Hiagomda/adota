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
     VALUES ($1, $2, $2, 'user', 'Belém') RETURNING id`,
    [`dev:${email}`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('animal passport', () => {
  let app: FastifyInstance;

  async function publish(email: string, userId: string, extra: Record<string, unknown> = {}) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro caramelo machucado.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...extra,
      },
    });
    expect(created.statusCode).toBe(201);
    const post = await app.inject({ method: 'GET', url: `/posts/${created.json().id}` });
    return { postId: created.json().id as string, animalId: post.json().animal.id as string };
  }

  const passport = (animalId: string, email?: string) =>
    app.inject({
      method: 'GET',
      url: `/animals/${animalId}`,
      headers: email ? auth(email) : {},
    });

  const addHealth = (animalId: string, email: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/animals/${animalId}/health`,
      headers: auth(email),
      payload,
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        animal_links, animal_custody, animal_health_records,
        notifications, reports, help_requests, sightings, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('shows public records to everyone and medical notes only to who cares', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    const { animalId } = await publish('autora@egua.local', authorId);

    const vaccine = await addHealth(animalId, 'autora@egua.local', {
      kind: 'vaccine',
      title: 'V10',
      notes: 'Lote 123',
      occurredOn: '2026-01-10',
      nextDueOn: '2027-01-10',
      visibility: 'public',
    });
    expect(vaccine.statusCode).toBe(201);
    const medicine = await addHealth(animalId, 'autora@egua.local', {
      kind: 'medication',
      title: 'Antibiótico',
      occurredOn: '2026-01-11',
    });
    expect(medicine.statusCode).toBe(201);

    const visitor = (await passport(animalId)).json();
    expect(visitor.health).toHaveLength(1);
    expect(visitor.health[0].title).toBe('V10');
    expect(visitor.health[0].notes).toBeNull();
    expect(visitor.health[0].nextDueOn).toBeNull();
    expect(visitor.permissions.caretaker).toBe(false);
    expect(visitor.care.vaccinated).toBe(true);

    const author = (await passport(animalId, 'autora@egua.local')).json();
    expect(author.health).toHaveLength(2);
    expect(author.health.find((item: { title: string }) => item.title === 'V10').notes).toBe(
      'Lote 123',
    );
    expect(author.permissions.canAddHealth).toBe(true);

    const intruder = await addHealth(animalId, 'vizinho@egua.local', {
      kind: 'exam',
      title: 'Sangue',
      occurredOn: '2026-01-11',
    });
    expect(intruder.statusCode).toBe(403);
  });

  it('does not duplicate a record sent twice with the same key', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const { animalId } = await publish('autora@egua.local', authorId);
    const payload = {
      kind: 'deworming',
      title: 'Vermífugo',
      occurredOn: '2026-02-01',
      clientKey: 'abcdefgh1234',
    };
    const first = await addHealth(animalId, 'autora@egua.local', payload);
    const second = await addHealth(animalId, 'autora@egua.local', payload);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    const rows = await pool.query(`SELECT 1 FROM animal_health_records`);
    expect(rows.rowCount).toBe(1);
  });

  it('records who had the animal as the status moves', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const { postId, animalId } = await publish('autora@egua.local', authorId);
    for (const status of ['rescued', 'fostered', 'for_adoption']) {
      const changed = await app.inject({
        method: 'PATCH',
        url: `/posts/${postId}/status`,
        headers: auth('autora@egua.local'),
        payload: { status },
      });
      expect(changed.statusCode).toBe(200);
    }
    const body = (await passport(animalId, 'autora@egua.local')).json();
    expect(body.custody.map((item: { kind: string }) => item.kind)).toEqual(['rescue', 'foster']);
    expect(body.custody.every((item: { endedAt: string | null }) => item.endedAt !== null)).toBe(
      true,
    );
    expect(body.custody[0].person.handle).toBe('autora');
    const kinds = body.timeline.map((item: { kind: string }) => item.kind);
    expect(kinds).toContain('status');
    expect(kinds).toContain('custody');
    // Quem não cuida vê que houve lar temporário, mas não de quem.
    const visitor = (await passport(animalId)).json();
    expect(visitor.custody[1].person).toBeNull();
  });

  it('joins two posts of the same author right away', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const first = await publish('autora@egua.local', authorId);
    const second = await publish('autora@egua.local', authorId, { name: 'Pipoca' });
    const linked = await app.inject({
      method: 'POST',
      url: `/animals/${second.animalId}/links`,
      headers: auth('autora@egua.local'),
      payload: { postId: first.postId, reason: 'Mesma mancha na orelha.' },
    });
    expect(linked.statusCode).toBe(201);
    expect(linked.json()).toMatchObject({ status: 'accepted', animalId: first.animalId });

    // O link antigo do animal juntado continua abrindo o passaporte que ficou.
    const viaOld = (await passport(second.animalId)).json();
    expect(viaOld.id).toBe(first.animalId);
    expect(viaOld.name).toBe('Pipoca');
    expect(viaOld.occurrences).toHaveLength(2);
    const post = await app.inject({ method: 'GET', url: `/posts/${second.postId}` });
    expect(post.json().animal.id).toBe(first.animalId);
  });

  it('asks the other author before joining and refuses another species', async () => {
    const aliceId = await insertUser('alice@egua.local', 'alice');
    const bobId = await insertUser('bob@egua.local', 'bob');
    const lost = await publish('alice@egua.local', aliceId, { type: 'lost' });
    const found = await publish('bob@egua.local', bobId);
    const cat = await publish('bob@egua.local', bobId, { species: 'cat' });

    const wrong = await app.inject({
      method: 'POST',
      url: `/animals/${lost.animalId}/links`,
      headers: auth('alice@egua.local'),
      payload: { postId: cat.postId, reason: 'Parece o meu.' },
    });
    expect(wrong.statusCode).toBe(400);

    const asked = await app.inject({
      method: 'POST',
      url: `/animals/${lost.animalId}/links`,
      headers: auth('alice@egua.local'),
      payload: { postId: found.postId, reason: 'É o meu cachorro, tem coleira azul.' },
    });
    expect(asked.statusCode).toBe(201);
    expect(asked.json().status).toBe('pending');
    const again = await app.inject({
      method: 'POST',
      url: `/animals/${lost.animalId}/links`,
      headers: auth('alice@egua.local'),
      payload: { postId: found.postId, reason: 'De novo.' },
    });
    expect(again.statusCode).toBe(409);

    const notice = await pool.query<{ payload: { route: string } }>(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'animal_link'`,
      [bobId],
    );
    expect(notice.rows[0]?.payload.route).toBe(`/animal/${found.animalId}`);

    const bobView = (await passport(found.animalId, 'bob@egua.local')).json();
    expect(bobView.pendingLinks).toHaveLength(1);
    const notAllowed = await app.inject({
      method: 'POST',
      url: `/animal-links/${asked.json().id}/accept`,
      headers: auth('alice@egua.local'),
    });
    expect(notAllowed.statusCode).toBe(403);
    const accepted = await app.inject({
      method: 'POST',
      url: `/animal-links/${asked.json().id}/accept`,
      headers: auth('bob@egua.local'),
    });
    expect(accepted.statusCode).toBe(200);
    const merged = (await passport(found.animalId)).json();
    expect(merged.occurrences).toHaveLength(2);
    expect(merged.id).toBe(lost.animalId);
  });

  it('answers 404 for an animal nobody can see', async () => {
    const missing = await passport('00000000-0000-4000-8000-000000000099');
    expect(missing.statusCode).toBe(404);
  });
});
