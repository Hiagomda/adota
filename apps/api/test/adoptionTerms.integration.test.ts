import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string, role = 'user', verified = false) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, verified, city)
     VALUES ($1, $2, $3, $4, $5, 'Belém') RETURNING id`,
    [`dev:${email}`, `${handle} Silva`, handle, role, verified],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

const ORG_TERM = `Termo da ONG Patas de Belém. Eu, {adotante}, adoto {animal} de {quem_entrega} em {data}. ${'Cláusula da ONG. '.repeat(15)}`;

describe('termo de adoção', () => {
  let app: FastifyInstance;

  async function adoptionPost(email: string, userId: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(email),
      payload: {
        type: 'adoption',
        species: 'cat',
        size: 'small',
        urgency: 'low',
        name: 'Mel',
        sex: 'female',
        care: { neutered: false },
        description: 'Gatinha dócil esperando um lar.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${userId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  async function adopt(id: string, giverEmail: string, adopterId: string) {
    await pool.query(
      `INSERT INTO adoption_interests (post_id, user_id, answers) VALUES ($1, $2, '{}'::jsonb)`,
      [id, adopterId],
    );
    const marked = await app.inject({
      method: 'PATCH',
      url: `/posts/${id}/status`,
      headers: auth(giverEmail),
      payload: { status: 'adopted' },
    });
    expect(marked.statusCode).toBe(200);
    const named = await app.inject({
      method: 'POST',
      url: `/posts/${id}/adopter`,
      headers: auth(giverEmail),
      payload: { userId: adopterId },
    });
    expect(named.statusCode).toBe(200);
  }

  const term = (id: string, email: string) =>
    app.inject({ method: 'GET', url: `/posts/${id}/adoption-term`, headers: auth(email) });
  const accept = (id: string, email: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/posts/${id}/adoption-term`,
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
        org_adoption_terms, adoption_terms, adoption_checkins, adoption_followups,
        adoption_interests, verification_requests, notifications, post_media, posts, animals,
        blocks, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('usa o termo do app, aceita uma vez e guarda o texto assinado', async () => {
    const giverId = await insertUser('protetora@egua.local', 'protetora');
    const adopterId = await insertUser('adotante@egua.local', 'adotante');
    await insertUser('curioso@egua.local', 'curioso');
    const id = await adoptionPost('protetora@egua.local', giverId);

    // Prévia antes da adoção: qualquer pessoa logada lê, ninguém aceita.
    const preview = await term(id, 'curioso@egua.local');
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ source: 'app', canAccept: false, accepted: null });
    expect(preview.json().text).toContain('telas de proteção');
    expect(preview.json().text).toContain('Castrar');
    expect(preview.json().text).toContain('Mel (gata)');

    await adopt(id, 'protetora@egua.local', adopterId);
    const pending = (await term(id, 'adotante@egua.local')).json();
    expect(pending).toMatchObject({ role: 'tutor', canAccept: true });
    expect((await term(id, 'protetora@egua.local')).json()).toMatchObject({
      role: 'responsible',
      waiting: true,
    });

    expect(
      (await accept(id, 'curioso@egua.local', { fullName: 'Curioso Silva', agree: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await accept(id, 'adotante@egua.local', { fullName: 'Ana', agree: true })).statusCode,
    ).toBe(400);
    expect(
      (await accept(id, 'adotante@egua.local', { fullName: 'Ana Souza', agree: false })).statusCode,
    ).toBe(400);

    const done = await accept(id, 'adotante@egua.local', { fullName: 'Ana  Souza', agree: true });
    expect(done.statusCode).toBe(201);
    expect(done.json()).toMatchObject({ canAccept: false, accepted: { fullName: 'Ana Souza' } });
    expect(done.json().text).toContain('Eu, Ana Souza, declaro');

    const again = await accept(id, 'adotante@egua.local', { fullName: 'Ana Souza', agree: true });
    expect(again.statusCode).toBe(409);

    const seen = (await term(id, 'protetora@egua.local')).json();
    expect(seen).toMatchObject({ waiting: false, accepted: { fullName: 'Ana Souza', cpf: null } });
    // Quem não é parte vê só a prévia, sem o aceite.
    expect((await term(id, 'curioso@egua.local')).json().accepted).toBeNull();

    const notified = await pool.query(
      `SELECT payload->>'title' AS title FROM notifications WHERE user_id = $1`,
      [giverId],
    );
    expect(notified.rows.map((row) => row.title)).toContain('Termo de adoção aceito');
  });

  it('a ONG escreve o próprio termo e pode pedir CPF e endereço', async () => {
    const ongId = await insertUser('ong@egua.local', 'ong', 'ngo', true);
    await pool.query(
      `INSERT INTO verification_requests (user_id, organization_name, status, decided_at)
       VALUES ($1, 'ONG Patas de Belém', 'approved', now())`,
      [ongId],
    );
    const adopterId = await insertUser('adotante@egua.local', 'adotante');
    await insertUser('comum@egua.local', 'comum');

    const forbidden = await app.inject({
      method: 'PUT',
      url: '/me/adoption-term',
      headers: auth('comum@egua.local'),
      payload: { body: ORG_TERM, requireIdentity: false },
    });
    expect(forbidden.statusCode).toBe(403);

    const empty = await app.inject({
      method: 'GET',
      url: '/me/adoption-term',
      headers: auth('ong@egua.local'),
    });
    expect(empty.json()).toMatchObject({ body: null, requireIdentity: false });
    expect(empty.json().appTemplate).toContain('{adotante}');

    const short = await app.inject({
      method: 'PUT',
      url: '/me/adoption-term',
      headers: auth('ong@egua.local'),
      payload: { body: 'Curto demais', requireIdentity: false },
    });
    expect(short.statusCode).toBe(400);
    const saved = await app.inject({
      method: 'PUT',
      url: '/me/adoption-term',
      headers: auth('ong@egua.local'),
      payload: { body: ORG_TERM, requireIdentity: true },
    });
    expect(saved.statusCode).toBe(200);

    const id = await adoptionPost('ong@egua.local', ongId);
    const preview = (await term(id, 'adotante@egua.local')).json();
    expect(preview).toMatchObject({
      source: 'org',
      giverName: 'ONG Patas de Belém',
      requireIdentity: true,
    });
    expect(preview.text).toContain('Termo da ONG Patas de Belém');

    await adopt(id, 'ong@egua.local', adopterId);
    const noIdentity = await accept(id, 'adotante@egua.local', {
      fullName: 'Ana Souza',
      agree: true,
    });
    expect(noIdentity.statusCode).toBe(400);
    const badCpf = await accept(id, 'adotante@egua.local', {
      fullName: 'Ana Souza',
      cpf: '111.111.111-11',
      address: 'Rua dos Mundurucus, 100',
      agree: true,
    });
    expect(badCpf.statusCode).toBe(400);
    const done = await accept(id, 'adotante@egua.local', {
      fullName: 'Ana Souza',
      cpf: '52998224725',
      address: 'Rua dos Mundurucus, 100',
      agree: true,
    });
    expect(done.statusCode).toBe(201);
    expect(done.json().text).toContain('Eu, Ana Souza, adoto Mel (gata) de ONG Patas de Belém');

    // A ONG trocar o termo depois não muda o que já foi aceito.
    await app.inject({
      method: 'PUT',
      url: '/me/adoption-term',
      headers: auth('ong@egua.local'),
      payload: { body: null, requireIdentity: false },
    });
    const seen = (await term(id, 'ong@egua.local')).json();
    expect(seen).toMatchObject({
      source: 'org',
      accepted: { cpf: '529.982.247-25', address: 'Rua dos Mundurucus, 100' },
    });
    expect(seen.text).toContain('Termo da ONG Patas de Belém');
  });
});
