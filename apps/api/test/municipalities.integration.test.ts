import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });

const places = {
  belem: { latitude: -1.45234, longitude: -48.48321, label: 'Nazaré, Belém' },
  castanhal: { latitude: -1.2964, longitude: -47.9262, label: 'Centro, Castanhal' },
  // Zona rural de Castanhal, sem rua: o rótulo vem só com o município.
  castanhalRural: { latitude: -1.4, longitude: -47.8, label: 'Perto de Castanhal' },
  barcarena: { latitude: -1.5058, longitude: -48.6253, label: 'Centro, Barcarena' },
  // BR-316 na divisa Belém x Ananindeua.
  border: { latitude: -1.3913, longitude: -48.4262, label: 'Entroncamento' },
} as const;

let ownerId = '';

async function post(
  app: FastifyInstance,
  place: { latitude: number; longitude: number; label: string },
  extra: Record<string, unknown> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/posts',
    headers: { authorization: 'Bearer dev:geo@egua.local' },
    payload: {
      species: 'dog',
      size: 'medium',
      urgency: 'high',
      description: `Cachorro em ${place.label}.`,
      latitude: place.latitude,
      longitude: place.longitude,
      approxLabel: place.label,
      media: [{ url: `uploads/${ownerId}/00000000-0000-4000-8000-000000000001.jpg` }],
      ...extra,
    },
  });
}

async function feed(app: FastifyInstance, query: string) {
  const response = await app.inject({ method: 'GET', url: `/posts?limit=50&${query}` });
  expect(response.statusCode).toBe(200);
  return response.json<{
    posts: {
      id: string;
      description: string;
      municipality: { code: string; name: string } | null;
    }[];
  }>().posts;
}

describe('municípios', () => {
  let app: FastifyInstance;

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
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ('dev:geo@egua.local', 'Geo', 'geo', 'user', 'Belém') RETURNING id`,
    );
    ownerId = user.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('tem os sete municípios com contorno no banco', async () => {
    const rows = await pool.query<{ slug: string; valid: boolean; seat_inside: boolean }>(
      `SELECT slug, ST_IsValid(area) AS valid, ST_Covers(area, seat::geometry) AS seat_inside
       FROM municipalities ORDER BY sort_order`,
    );
    expect(rows.rows.map((row) => row.slug)).toEqual([
      'belem',
      'ananindeua',
      'marituba',
      'benevides',
      'santa-barbara-do-para',
      'castanhal',
      'barcarena',
    ]);
    expect(rows.rows.every((row) => row.valid && row.seat_inside)).toBe(true);
  });

  it('cadastra em Belém, Castanhal e Barcarena e grava o município certo', async () => {
    for (const place of [places.belem, places.castanhal, places.castanhalRural, places.barcarena]) {
      const created = await post(app, place);
      expect(created.statusCode).toBe(201);
    }
    const stored = await pool.query<{ approx_label: string; municipality_code: string }>(
      `SELECT approx_label, municipality_code FROM posts ORDER BY approx_label`,
    );
    expect(
      Object.fromEntries(stored.rows.map((row) => [row.approx_label, row.municipality_code])),
    ).toEqual({
      'Centro, Barcarena': '1501303',
      'Centro, Castanhal': '1502400',
      'Nazaré, Belém': '1501402',
      'Perto de Castanhal': '1502400',
    });

    const all = await feed(app, '');
    expect(all.map((item) => item.municipality?.name).sort()).toEqual([
      'Barcarena',
      'Belém',
      'Castanhal',
      'Castanhal',
    ]);
  });

  it('filtra por código, por slug e acha pela busca de lugar', async () => {
    await post(app, places.belem);
    await post(app, places.castanhal);
    await post(app, places.barcarena);

    expect(
      (await feed(app, 'municipality=1502400')).map((item) => item.municipality?.name),
    ).toEqual(['Castanhal']);
    expect(
      (await feed(app, 'municipality=barcarena')).map((item) => item.municipality?.name),
    ).toEqual(['Barcarena']);
    // "castanhal" não está no rótulo de Belém nem de Barcarena: só o município acha.
    expect((await feed(app, 'place=castanhal')).map((item) => item.municipality?.name)).toEqual([
      'Castanhal',
    ]);
    const unknown = await app.inject({ method: 'GET', url: '/posts?municipality=sao-paulo' });
    expect(unknown.statusCode).toBe(400);
  });

  it('o mapa de Castanhal só traz Castanhal e os detalhes mostram o município', async () => {
    await post(app, places.belem);
    const castanhal = await post(app, places.castanhal);
    const id = castanhal.json<{ id: string }>().id;
    const box = 'west=-48.04&south=-1.5&east=-47.63&north=-1.03';
    const inBox = await feed(app, box);
    expect(inBox.map((item) => item.id)).toEqual([id]);
    const detail = await app.inject({ method: 'GET', url: `/posts/${id}` });
    expect(detail.json<{ municipality: unknown }>().municipality).toEqual({
      code: '1502400',
      name: 'Castanhal',
    });
  });

  it('na divisa respeita a escolha da pessoa e longe dela usa o ponto', async () => {
    const chosen = await post(app, places.border, { municipalityCode: '1500800' });
    expect(chosen.statusCode).toBe(201);
    const ignored = await post(app, places.belem, { municipalityCode: '1502400' });
    expect(ignored.statusCode).toBe(201);
    const rows = await pool.query<{ approx_label: string; municipality_code: string }>(
      `SELECT approx_label, municipality_code FROM posts ORDER BY approx_label`,
    );
    expect(rows.rows).toEqual([
      { approx_label: 'Entroncamento', municipality_code: '1500800' },
      { approx_label: 'Nazaré, Belém', municipality_code: '1501402' },
    ]);
  });

  it('recusa ponto fora dos municípios e código inválido', async () => {
    const far = await post(app, { latitude: -1.72, longitude: -48.88, label: 'Abaetetuba' });
    expect(far.statusCode).toBe(400);
    expect(far.json<{ message?: string; error?: string }>().message ?? '').toContain('Barcarena');
    const bad = await post(app, places.belem, { municipalityCode: 'belem' });
    expect(bad.statusCode).toBe(400);
  });

  it('APK antigo e caminhos sem município: o gatilho preenche e recalcula', async () => {
    const animal = await pool.query<{ id: string }>(
      `INSERT INTO animals (species, size, status) VALUES ('cat', 'small', 'open') RETURNING id`,
    );
    const inserted = await pool.query<{ id: string; municipality_code: string }>(
      `INSERT INTO posts (author_id, animal_id, type, urgency, description, location, approx_label, status)
       VALUES ($1, $2, 'rescue_alert', 'low', 'Gato.', ST_SetSRID(ST_MakePoint(-48.6253, -1.5058), 4326)::geography,
               'Barcarena', 'open')
       RETURNING id, municipality_code`,
      [ownerId, animal.rows[0]?.id],
    );
    expect(inserted.rows[0]?.municipality_code).toBe('1501303');
    const moved = await pool.query<{ municipality_code: string }>(
      `UPDATE posts SET location = ST_SetSRID(ST_MakePoint(-47.9262, -1.2964), 4326)::geography
       WHERE id = $1 RETURNING municipality_code`,
      [inserted.rows[0]?.id],
    );
    expect(moved.rows[0]?.municipality_code).toBe('1502400');
  });

  it('lista os municípios com a contagem de animais no mapa', async () => {
    await post(app, places.castanhal);
    await post(app, places.castanhal);
    await post(app, places.barcarena);
    const response = await app.inject({ method: 'GET', url: '/municipalities' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ municipalities: { slug: string; animals: number }[] }>();
    const counts = Object.fromEntries(body.municipalities.map((item) => [item.slug, item.animals]));
    expect(counts).toMatchObject({ belem: 0, castanhal: 2, barcarena: 1, marituba: 0 });
    expect(JSON.stringify(body)).not.toContain('geo@egua.local');
  });
});
