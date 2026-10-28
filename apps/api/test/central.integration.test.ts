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

interface CentralCase {
  id: string;
  urgency: string;
  withoutHelp: boolean;
  fosterStay: string | null;
  goingCount: number;
  offerCounts: Record<string, number>;
  volunteers: { name: string }[];
  reasons: string[];
  distanceKm: number | null;
  location: { exact: boolean; latitude: number };
  viewer: { offers: string[]; willHelp: boolean; isAuthor: boolean };
}

describe('rescue central', () => {
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

  const central = async (query = '', email?: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/central${query}`,
      headers: email ? auth(email) : {},
    });
    expect(response.statusCode).toBe(200);
    return response.json() as {
      summary: { activeCases: number; withoutHelp: number; volunteers: number; urgent: number };
      cases: CentralCase[];
      serverTime: string;
    };
  };

  const offer = (postId: string, email: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/posts/${postId}/help-offers`,
      headers: auth(email),
      payload,
    });

  const decide = (offerId: string, decision: string, email: string) =>
    app.inject({
      method: 'POST',
      url: `/help-offers/${offerId}/${decision}`,
      headers: auth(email),
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        rescue_help_offers, foster_stays, animal_links, animal_custody, animal_health_records,
        notifications, reports, help_requests, sightings, responses, post_media, posts, animals,
        blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('lists open rescues with the urgent one without help first', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('vizinho@egua.local', 'vizinho');
    const calm = await publish('autora@egua.local', authorId, { urgency: 'low' });
    const urgent = await publish('autora@egua.local', authorId, { urgency: 'high' });
    // Adoção e perdido não são casos da central.
    await publish('autora@egua.local', authorId, { type: 'lost' });

    const going = await app.inject({
      method: 'POST',
      url: `/posts/${calm}/responses`,
      headers: auth('vizinho@egua.local'),
      payload: { kind: 'will_help' },
    });
    expect(going.statusCode).toBe(201);

    const page = await central('?latitude=-1.45&longitude=-48.48');
    expect(page.cases.map((item) => item.id)).toEqual([urgent, calm]);
    const [first, second] = page.cases;
    expect(first?.withoutHelp).toBe(true);
    expect(first?.reasons).toContain('Marcado como urgente');
    expect(first?.reasons).toContain('Ninguém a caminho');
    expect(second?.goingCount).toBe(1);
    expect(second?.volunteers).toEqual([{ name: 'vizinho', handle: 'vizinho', avatarUrl: null }]);
    expect(first?.location.exact).toBe(false);
    expect(first?.distanceKm).toBeGreaterThanOrEqual(0.5);
    expect(page.summary).toEqual({ activeCases: 2, withoutHelp: 1, volunteers: 1, urgent: 1 });

    const onlyWithout = await central('?withoutHelp=true');
    expect(onlyWithout.cases.map((item) => item.id)).toEqual([urgent]);
    const onlyGoing = await central('?status=on_the_way');
    expect(onlyGoing.cases.map((item) => item.id)).toEqual([calm]);
    const cats = await central('?species=cat');
    expect(cats.cases).toHaveLength(0);
  });

  it('filters by distance from where the person is', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const near = await publish('autora@egua.local', authorId);
    await publish('autora@egua.local', authorId, {
      latitude: -1.3,
      longitude: -48.45,
      approxLabel: 'Icoaraci, Belém',
    });
    const page = await central('?latitude=-1.452&longitude=-48.483&radiusKm=3');
    expect(page.cases.map((item) => item.id)).toEqual([near]);
    const bad = await app.inject({ method: 'GET', url: '/central?radiusKm=3' });
    expect(bad.statusCode).toBe(400);
  });

  it('records an offer once, notifies the author and lets them answer', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const helperId = await insertUser('ajuda@egua.local', 'ajuda');
    await insertUser('curioso@egua.local', 'curioso');
    const postId = await publish('autora@egua.local', authorId);

    const first = await offer(postId, 'ajuda@egua.local', {
      kind: 'foster',
      note: 'Tenho quintal',
    });
    expect(first.statusCode).toBe(201);
    const again = await offer(postId, 'ajuda@egua.local', { kind: 'foster' });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    const transport = await offer(postId, 'ajuda@egua.local', { kind: 'transport' });
    expect(transport.statusCode).toBe(400);
    const own = await offer(postId, 'autora@egua.local', { kind: 'food' });
    expect(own.statusCode).toBe(400);

    const notes = await pool.query<{ user_id: string; payload: { route: string } }>(
      `SELECT user_id, payload FROM notifications WHERE type = 'help_offer'`,
    );
    expect(notes.rows).toHaveLength(1);
    expect(notes.rows[0]?.user_id).toBe(authorId);
    expect(notes.rows[0]?.payload.route).toBe(`/post/${postId}`);

    const page = await central('', 'ajuda@egua.local');
    expect(page.cases[0]?.offerCounts.foster).toBe(1);
    expect(page.cases[0]?.withoutHelp).toBe(false);
    expect(page.cases[0]?.viewer.offers).toEqual(['foster']);

    // O recado só aparece para quem publicou e para quem ofereceu.
    const forStranger = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/help-offers`,
      headers: auth('curioso@egua.local'),
    });
    expect(forStranger.json().offers[0].note).toBeNull();
    expect(forStranger.json().offers[0].person.name).toBe('ajuda');
    expect(forStranger.json().canDecide).toBe(false);
    const forAuthor = await app.inject({
      method: 'GET',
      url: `/posts/${postId}/help-offers`,
      headers: auth('autora@egua.local'),
    });
    expect(forAuthor.json().offers[0].note).toBe('Tenho quintal');
    expect(forAuthor.json().canDecide).toBe(true);

    const offerId = first.json().id as string;
    expect((await decide(offerId, 'accept', 'curioso@egua.local')).statusCode).toBe(403);
    expect((await decide(offerId, 'accept', 'ajuda@egua.local')).statusCode).toBe(403);
    const accepted = await decide(offerId, 'accept', 'autora@egua.local');
    expect(accepted.json().status).toBe('accepted');
    // Repetir não muda nada e não avisa de novo.
    expect((await decide(offerId, 'accept', 'autora@egua.local')).json().status).toBe('accepted');
    expect((await decide(offerId, 'decline', 'autora@egua.local')).statusCode).toBe(409);
    const helperNotes = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'help_offer'`,
      [helperId],
    );
    expect(helperNotes.rowCount).toBe(1);

    const withdrawn = await decide(offerId, 'withdraw', 'ajuda@egua.local');
    expect(withdrawn.json().status).toBe('withdrawn');
    // Depois de desistir, pode oferecer de novo.
    expect((await offer(postId, 'ajuda@egua.local', { kind: 'foster' })).statusCode).toBe(201);
  });

  it('keeps one active offer even when two arrive at the same time', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    await insertUser('ajuda@egua.local', 'ajuda');
    const postId = await publish('autora@egua.local', authorId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => offer(postId, 'ajuda@egua.local', { kind: 'food' })),
    );
    expect(results.every((result) => result.statusCode < 300)).toBe(true);
    const rows = await pool.query(`SELECT 1 FROM rescue_help_offers WHERE kind = 'food'`);
    expect(rows.rowCount).toBe(1);
  });

  it('hides blocked authors and refuses offers between them', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const otherId = await insertUser('bloqueado@egua.local', 'bloqueado');
    const postId = await publish('autora@egua.local', authorId);
    await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
      authorId,
      otherId,
    ]);
    const page = await central('', 'bloqueado@egua.local');
    expect(page.cases).toHaveLength(0);
    expect((await offer(postId, 'bloqueado@egua.local', { kind: 'vet' })).statusCode).toBe(404);
  });

  it('drops a rescue from the central once it is in a foster home', async () => {
    const authorId = await insertUser('autora@egua.local', 'autora');
    const postId = await publish('autora@egua.local', authorId);
    const moved = await app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: auth('autora@egua.local'),
      payload: { status: 'rescued' },
    });
    expect(moved.statusCode).toBe(200);
    const rescued = await central();
    expect(rescued.cases[0]?.reasons).toContain('Resgatado, precisa de lar temporário');
    // Com acolhimento aprovado numa Casa Amiga, o lar deixa de faltar.
    const hostId = await insertUser('casa@egua.local', 'casa');
    await pool.query(
      `INSERT INTO foster_stays (foster_id, post_id, animal_id, requested_by, status, message)
       SELECT $1, p.id, p.animal_id, p.author_id, 'approved', 'Pode vir para cá'
       FROM posts p WHERE p.id = $2`,
      [hostId, postId],
    );
    const housed = await central();
    expect(housed.cases[0]?.reasons).not.toContain('Resgatado, precisa de lar temporário');
    expect(housed.cases[0]?.fosterStay).toBe('approved');
    expect(housed.cases[0]?.withoutHelp).toBe(false);
    await app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: auth('autora@egua.local'),
      payload: { status: 'fostered' },
    });
    expect((await central()).cases).toHaveLength(0);
    await insertUser('ajuda@egua.local', 'ajuda');
    expect((await offer(postId, 'ajuda@egua.local', { kind: 'food' })).statusCode).toBe(400);
  });
});
