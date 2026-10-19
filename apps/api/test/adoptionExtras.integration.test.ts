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

describe('ficha, espera, feiras e cadastro de ONG', () => {
  let app: FastifyInstance;

  async function publishAdoption(email: string, userId: string): Promise<string> {
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
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  function fair(startsInDays: number, latitude = -1.4588, longitude = -48.4878) {
    const startsAt = new Date(Date.now() + startsInDays * 86_400_000);
    return {
      title: 'Feira de adoção na praça',
      placeLabel: 'Praça Batista Campos',
      latitude,
      longitude,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
    };
  }

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        adoption_interests, adoption_events, adoption_terms, verification_requests,
        notifications, reports, help_requests, fosters, story_views, blocks, post_follows,
        follows, saves, likes, comments, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('guarda a ficha, avisa quem cuida uma vez e só mostra a ela', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    await insertUser('adopter@egua.local', 'adopter');
    await insertUser('nosy@egua.local', 'nosy');
    const id = await publishAdoption('author@egua.local', authorId);

    const send = (payload: object) =>
      app.inject({
        method: 'POST',
        url: `/posts/${id}/adoption-interest`,
        headers: auth('adopter@egua.local'),
        payload,
      });
    expect((await send(answers)).statusCode).toBe(201);
    expect((await send({ ...answers, note: 'Moro perto do Bosque.' })).statusCode).toBe(201);
    expect((await send({ ...answers, note: 'Vendo por R$ 50' })).statusCode).toBe(400);

    const notices = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'adoption_interest'`,
      [authorId],
    );
    expect(notices.rowCount).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: `/posts/${id}/adoption-interests`,
      headers: auth('author@egua.local'),
    });
    expect(list.statusCode).toBe(200);
    const [interest] = list.json().interests;
    expect(interest.person.handle).toBe('adopter');
    expect(interest.answers).toEqual(answers);
    expect(interest.note).toBe('Moro perto do Bosque.');

    const nosy = await app.inject({
      method: 'GET',
      url: `/posts/${id}/adoption-interests`,
      headers: auth('nosy@egua.local'),
    });
    expect(nosy.statusCode).toBe(403);

    const mine = await app.inject({
      method: 'GET',
      url: '/me/adoption-interest',
      headers: auth('adopter@egua.local'),
    });
    expect(mine.json().answers).toEqual(answers);

    const own = await app.inject({
      method: 'POST',
      url: `/posts/${id}/adoption-interest`,
      headers: auth('author@egua.local'),
      payload: answers,
    });
    expect(own.statusCode).toBe(400);
  });

  it('lista quem espera um lar há semanas, do mais antigo para o mais novo', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    const old = await publishAdoption('author@egua.local', authorId);
    const older = await publishAdoption('author@egua.local', authorId);
    await publishAdoption('author@egua.local', authorId);
    await pool.query(`UPDATE posts SET created_at = now() - interval '20 days' WHERE id = $1`, [
      old,
    ]);
    await pool.query(`UPDATE posts SET created_at = now() - interval '60 days' WHERE id = $1`, [
      older,
    ]);

    const waiting = (await app.inject({ method: 'GET', url: '/adoption/waiting' })).json();
    expect(waiting.posts.map((post: { id: string }) => post.id)).toEqual([older, old]);
    const since = Date.parse(waiting.posts[0].adoptionSince);
    expect(Date.now() - since).toBeGreaterThan(59 * 86_400_000);

    const dogs = (await app.inject({ method: 'GET', url: '/adoption/waiting?species=dog' })).json();
    expect(dogs.posts).toEqual([]);
  });

  it('conta a espera a partir de quando o resgate foi para adoção', async () => {
    const authorId = await insertUser('author@egua.local', 'author');
    const rescue = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('author@egua.local'),
      payload: {
        type: 'rescue_alert',
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro na chuva.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    const id = rescue.json().id as string;
    await pool.query(`UPDATE posts SET created_at = now() - interval '90 days' WHERE id = $1`, [
      id,
    ]);
    for (const status of ['on_the_way', 'rescued', 'fostered', 'for_adoption']) {
      const moved = await app.inject({
        method: 'PATCH',
        url: `/posts/${id}/status`,
        headers: auth('author@egua.local'),
        payload: { status },
      });
      expect(moved.statusCode).toBeLessThan(300);
    }
    const post = (await app.inject({ method: 'GET', url: `/posts/${id}` })).json();
    expect(Date.now() - Date.parse(post.adoptionSince)).toBeLessThan(60_000);
    const waiting = (await app.inject({ method: 'GET', url: '/adoption/waiting' })).json();
    expect(waiting.posts).toEqual([]);
  });

  it('deixa só ONG ou protetor verificado divulgar feira, e só em Belém', async () => {
    await insertUser('person@egua.local', 'person');
    await insertUser('ngo@egua.local', 'ngo', 'ngo', true);
    await insertUser('other@egua.local', 'other', 'protector', true);

    const denied = await app.inject({
      method: 'POST',
      url: '/adoption-events',
      headers: auth('person@egua.local'),
      payload: fair(3),
    });
    expect(denied.statusCode).toBe(403);

    const outside = await app.inject({
      method: 'POST',
      url: '/adoption-events',
      headers: auth('ngo@egua.local'),
      payload: fair(3, -23.55, -46.63),
    });
    expect(outside.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: '/adoption-events',
      headers: auth('ngo@egua.local'),
      payload: fair(3),
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const listed = (
      await app.inject({ method: 'GET', url: '/adoption-events', headers: auth('ngo@egua.local') })
    ).json();
    expect(listed.canCreate).toBe(true);
    expect(listed.events).toHaveLength(1);
    expect(listed.events[0].organizer.handle).toBe('ngo');
    expect(listed.events[0].canRemove).toBe(true);

    const anonymous = (await app.inject({ method: 'GET', url: '/adoption-events' })).json();
    expect(anonymous.canCreate).toBe(false);
    expect(anonymous.events[0].canRemove).toBe(false);

    const foreign = await app.inject({
      method: 'DELETE',
      url: `/adoption-events/${id}`,
      headers: auth('other@egua.local'),
    });
    expect(foreign.statusCode).toBe(404);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/adoption-events/${id}`,
      headers: auth('ngo@egua.local'),
    });
    expect(removed.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/adoption-events' })).json().events).toEqual(
      [],
    );
  });

  it('recebe o cadastro de ONG uma vez e avisa a pessoa da decisão', async () => {
    const personId = await insertUser('person@egua.local', 'person');
    await insertUser('admin@egua.local', 'admin', 'admin', true);

    const empty = await app.inject({
      method: 'GET',
      url: '/me/verification',
      headers: auth('person@egua.local'),
    });
    expect(empty.json().request).toBeNull();

    const ask = () =>
      app.inject({
        method: 'POST',
        url: '/me/verification',
        headers: auth('person@egua.local'),
        payload: {
          kind: 'protector',
          organizationName: 'Gatinhos do Guamá',
          instagram: '@gatinhosdoguama',
          neighborhood: 'Guamá',
          note: 'Cuido de 12 gatos resgatados.',
        },
      });
    expect((await ask()).statusCode).toBe(201);
    expect((await ask()).statusCode).toBe(409);

    const status = (
      await app.inject({
        method: 'GET',
        url: '/me/verification',
        headers: auth('person@egua.local'),
      })
    ).json();
    expect(status.request.status).toBe('pending');
    expect(status.request.kind).toBe('protector');

    const queue = (
      await app.inject({
        method: 'GET',
        url: '/admin/verifications',
        headers: auth('admin@egua.local'),
      })
    ).json();
    expect(queue.verifications[0].instagram).toBe('gatinhosdoguama');
    const approved = await app.inject({
      method: 'POST',
      url: `/admin/verifications/${queue.verifications[0].id}`,
      headers: auth('admin@egua.local'),
      payload: { action: 'approve', role: 'protector' },
    });
    expect(approved.statusCode).toBe(200);

    const user = await pool.query<{ verified: boolean; role: string }>(
      `SELECT verified, role FROM users WHERE id = $1`,
      [personId],
    );
    expect(user.rows[0]).toEqual({ verified: true, role: 'protector' });
    const notice = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'verification'`,
      [personId],
    );
    expect(notice.rowCount).toBe(1);
  });
});
