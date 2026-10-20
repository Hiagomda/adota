import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, city) VALUES ($1, $2, $2, 'Belém') RETURNING id`,
    [`dev:${email}`, handle],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('publicação pela fila offline', () => {
  let app: FastifyInstance;

  function publish(email: string, userId: string, clientKey?: string) {
    return app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro machucado na feira.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
        ...(clientKey ? { clientKey } : {}),
      },
    });
  }

  const rescues = async () =>
    (await pool.query(`SELECT count(*)::int AS total FROM posts WHERE parent_post_id IS NULL`))
      .rows[0]?.total;

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE notifications, reports, help_requests, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('reenviar com a mesma chave devolve o mesmo resgate', async () => {
    const id = await insertUser('fila@egua.local', 'fila');
    const first = await publish('fila@egua.local', id, '1792500000000-abc12345');
    expect(first.statusCode).toBe(201);
    const again = await publish('fila@egua.local', id, '1792500000000-abc12345');
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect(await rescues()).toBe(1);
  });

  it('dois envios simultâneos com a mesma chave viram um resgate só', async () => {
    const id = await insertUser('duplo@egua.local', 'duplo');
    const both = await Promise.all([
      publish('duplo@egua.local', id, '1792500000001-zzz99999'),
      publish('duplo@egua.local', id, '1792500000001-zzz99999'),
    ]);
    expect(both[0]?.json().id).toBe(both[1]?.json().id);
    expect(await rescues()).toBe(1);
  });

  it('chaves diferentes, ou sem chave como nos APKs antigos, criam resgates diferentes', async () => {
    const id = await insertUser('varios@egua.local', 'varios');
    expect((await publish('varios@egua.local', id, '1792500000002-aaaa1111')).statusCode).toBe(201);
    expect((await publish('varios@egua.local', id, '1792500000003-bbbb2222')).statusCode).toBe(201);
    expect((await publish('varios@egua.local', id)).statusCode).toBe(201);
    expect((await publish('varios@egua.local', id)).statusCode).toBe(201);
    expect(await rescues()).toBe(4);
  });

  it('a mesma chave em contas diferentes não mistura os resgates', async () => {
    const ana = await insertUser('ana@egua.local', 'ana');
    const bia = await insertUser('bia@egua.local', 'bia');
    const fromAna = await publish('ana@egua.local', ana, '1792500000004-mesma000');
    const fromBia = await publish('bia@egua.local', bia, '1792500000004-mesma000');
    expect(fromBia.statusCode).toBe(201);
    expect(fromBia.json().id).not.toBe(fromAna.json().id);
  });

  it('recusa chave com caractere estranho', async () => {
    const id = await insertUser('estranha@egua.local', 'estranha');
    expect((await publish('estranha@egua.local', id, "x'; DROP TABLE posts;--")).statusCode).toBe(
      400,
    );
  });

  it('conta o limite de publicação por conta, não pelo IP da operadora', async () => {
    const busy = await insertUser('apressada@egua.local', 'apressada');
    const neighbour = await insertUser('vizinha@egua.local', 'vizinha');
    for (let index = 0; index < 20; index += 1) {
      expect((await publish('apressada@egua.local', busy)).statusCode).toBe(201);
    }
    expect((await publish('apressada@egua.local', busy)).statusCode).toBe(429);
    // Mesmo IP no teste, outra pessoa: continua podendo publicar.
    expect((await publish('vizinha@egua.local', neighbour)).statusCode).toBe(201);
  });
});
