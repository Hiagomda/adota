import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(email: string, handle: string, role = 'user'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city)
     VALUES ($1, $2, $2, $3, 'Belém') RETURNING id`,
    [`dev:${email}`, handle, role],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

/** Sessão do painel sem passar pelo login: o token vai direto para a tabela, como o login faz. */
async function staffToken(userId: string): Promise<string> {
  const token = `adm.teste-${userId}`;
  await pool.query(
    `INSERT INTO admin_sessions (user_id, token_hash, csrf_hash, expires_at, idle_expires_at)
     VALUES ($1, $2, 'x', now() + interval '1 hour', now() + interval '30 minutes')`,
    [userId, createHash('sha256').update(token).digest('hex')],
  );
  return token;
}

const shop = {
  name: 'Petshop do Guamá',
  kind: 'petshop',
  perk: '10% de desconto em ração para quem adotar pelo app',
  hours: 'Seg a sáb, 8h às 18h',
  addressText: 'Rua José Bonifácio, 100 · Guamá',
  latitude: -1.4558,
  longitude: -48.4902,
  whatsapp: '(91) 98888-7777',
  instagram: '@petshopguama',
};

const belemArea = '?west=-48.6&south=-1.6&east=-48.3&north=-1.2';

describe('partners', () => {
  let app: FastifyInstance;

  const request = (email: string, payload: Record<string, unknown> = shop) =>
    app.inject({ method: 'POST', url: '/partners', headers: auth(email), payload });

  const onMap = async (query = belemArea) => {
    const response = await app.inject({ method: 'GET', url: `/partners${query}` });
    expect(response.statusCode).toBe(200);
    return response.json().partners as { id: string; name: string; whatsapp: string }[];
  };

  const review = (token: string, id: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/admin/v1/partners/${id}/review`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE partner_daily_stats, partners, audit_events, admin_sessions, notifications, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('only shows a partner on the map after the team approves it', async () => {
    const ownerId = await insertUser('loja@egua.local', 'loja');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');

    expect((await app.inject({ method: 'POST', url: '/partners', payload: shop })).statusCode).toBe(
      401,
    );
    const created = await request('loja@egua.local');
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(await onMap()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/partners/${id}` })).statusCode).toBe(404);

    const mine = await app.inject({
      method: 'GET',
      url: '/partners/mine',
      headers: auth('loja@egua.local'),
    });
    expect(mine.json().partners[0]).toMatchObject({
      status: 'pending',
      visible: false,
      whatsapp: '5591988887777',
      instagram: 'petshopguama',
    });

    const token = await staffToken(modId);
    const pending = await app.inject({
      method: 'GET',
      url: '/admin/v1/partners?filter=pending',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pending.json().partners.map((item: { id: string }) => item.id)).toEqual([id]);
    expect((await review(token, id, { action: 'reject' })).statusCode).toBe(400);
    const approved = await review(token, id, { action: 'approve', featured: true });
    expect(approved.statusCode).toBe(200);
    expect((await review(token, id, { action: 'approve' })).statusCode).toBe(409);

    const listed = await onMap();
    expect(listed.map((item) => item.name)).toEqual(['Petshop do Guamá']);
    expect(await onMap('?west=-48.48&south=-1.44&east=-48.40&north=-1.40')).toEqual([]);
    const spotlight = await app.inject({
      method: 'GET',
      url: '/partners/spotlight?latitude=-1.45&longitude=-48.49',
    });
    expect(spotlight.json().partners.map((item: { id: string }) => item.id)).toEqual([id]);

    const notice = await pool.query<{ type: string; user_id: string }>(
      `SELECT type, user_id FROM notifications`,
    );
    expect(notice.rows).toEqual([{ type: 'partner_review', user_id: ownerId }]);
    const audit = await pool.query<{ action: string }>(`SELECT action FROM audit_events`);
    expect(audit.rows.map((row) => row.action)).toContain('partner.review_approve');
  });

  it('lets the owner pause, edit back into review and see the counters', async () => {
    await insertUser('loja@egua.local', 'loja');
    await insertUser('vizinha@egua.local', 'vizinha');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const id = (await request('loja@egua.local')).json().id as string;
    const token = await staffToken(modId);
    await review(token, id, { action: 'approve' });

    const tap = (kind: string, email?: string) =>
      app.inject({
        method: 'POST',
        url: `/partners/${id}/tap`,
        headers: email ? auth(email) : {},
        payload: { kind },
      });
    expect((await tap('view')).statusCode).toBe(200);
    await tap('whatsapp', 'vizinha@egua.local');
    await tap('whatsapp', 'vizinha@egua.local');
    // O dono tocando no próprio cartão não conta.
    await tap('view', 'loja@egua.local');
    const mine = async () =>
      (
        await app.inject({
          method: 'GET',
          url: '/partners/mine',
          headers: auth('loja@egua.local'),
        })
      ).json().partners[0];
    expect((await mine()).stats).toMatchObject({ views: 1, whatsappTaps: 2, routeTaps: 0 });

    const paused = await app.inject({
      method: 'POST',
      url: `/partners/${id}/pause`,
      headers: auth('loja@egua.local'),
      payload: { paused: true },
    });
    expect(paused.statusCode).toBe(200);
    expect(await onMap()).toEqual([]);
    await app.inject({
      method: 'POST',
      url: `/partners/${id}/pause`,
      headers: auth('loja@egua.local'),
      payload: { paused: false },
    });
    expect(await onMap()).toHaveLength(1);

    // Outra pessoa não mexe no cadastro.
    const stranger = await app.inject({
      method: 'PATCH',
      url: `/partners/${id}`,
      headers: auth('vizinha@egua.local'),
      payload: shop,
    });
    expect(stranger.statusCode).toBe(404);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/partners/${id}`,
      headers: auth('loja@egua.local'),
      payload: { ...shop, perk: 'Banho grátis no primeiro mês para animal adotado' },
    });
    expect(edited.json().status).toBe('pending');
    expect(await onMap()).toEqual([]);
  });

  it('refuses sales, places outside Belém and repeated requests', async () => {
    await insertUser('loja@egua.local', 'loja');
    const sale = await request('loja@egua.local', {
      ...shop,
      perk: 'Vendo filhotes de raça com desconto',
    });
    expect(sale.statusCode).toBe(400);
    const far = await request('loja@egua.local', { ...shop, latitude: -23.55, longitude: -46.63 });
    expect(far.statusCode).toBe(400);
    for (let index = 0; index < 3; index += 1) {
      expect((await request('loja@egua.local')).statusCode).toBe(201);
    }
    expect((await request('loja@egua.local')).statusCode).toBe(429);
  });
});
