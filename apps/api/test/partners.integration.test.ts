import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { forgetSettingsCache } from '../src/appSettings.js';
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

/** Hoje mais `days` dias, no fuso de Belém. */
function belemDay(days: number): string {
  return new Date(Date.now() - 3 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

async function openAds(enabled: boolean): Promise<void> {
  // O TRUNCATE de users leva a linha junto (CASCADE pelo updated_by).
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('partners_enabled', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(enabled)],
  );
  forgetSettingsCache();
}

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

  const staffPost = (token: string, url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload });

  const pay = (token: string, id: string, paidUntil: string | null = belemDay(30)) =>
    staffPost(token, `/admin/v1/partners/${id}/paid`, { paidUntil });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE partner_daily_stats, partners, audit_events, admin_sessions, notifications, users
      RESTART IDENTITY CASCADE
    `);
    await openAds(true);
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
    expect((await pay(token, id)).statusCode).toBe(200);
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
    await pay(token, id);

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

  it('hides every partner while the ads are off or unpaid', async () => {
    await insertUser('loja@egua.local', 'loja');
    const adminId = await insertUser('equipe@egua.local', 'equipe', 'admin');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const id = (await request('loja@egua.local')).json().id as string;
    const token = await staffToken(adminId);
    await review(token, id, { action: 'approve', featured: true });

    // Aprovado, mas sem pagamento: fica fora do mapa.
    expect(await onMap()).toEqual([]);
    expect((await pay(token, id, belemDay(-1))).statusCode).toBe(200);
    expect(await onMap()).toEqual([]);
    expect((await pay(token, id, belemDay(0))).statusCode).toBe(200);
    expect(await onMap()).toHaveLength(1);
    expect((await pay(token, id, 'amanhã')).statusCode).toBe(400);

    // A chave desligada esconde tudo, inclusive do APK antigo, e barra cadastro novo.
    const status = () => app.inject({ method: 'GET', url: '/partners/status' });
    expect((await status()).json()).toEqual({ enabled: true });
    const modToken = await staffToken(modId);
    expect(
      (await staffPost(modToken, '/admin/v1/settings', { partnersEnabled: false })).statusCode,
    ).toBe(403);
    const off = await staffPost(token, '/admin/v1/settings', { partnersEnabled: false });
    expect(off.statusCode).toBe(200);
    expect((await status()).json()).toEqual({ enabled: false });
    expect(await onMap()).toEqual([]);
    const spotlight = await app.inject({ method: 'GET', url: '/partners/spotlight' });
    expect(spotlight.json().partners).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/partners/${id}` })).statusCode).toBe(404);
    const closed = await request('loja@egua.local');
    expect(closed.statusCode).toBe(403);
    expect(closed.json().message).toContain('ainda não estão abertos');
    const mine = await app.inject({
      method: 'GET',
      url: '/partners/mine',
      headers: auth('loja@egua.local'),
    });
    expect(mine.json()).toMatchObject({ enabled: false, partners: [{ id, visible: true }] });

    const settings = await app.inject({
      method: 'GET',
      url: '/admin/v1/settings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(settings.json()).toEqual({ partnersEnabled: false });
    const audit = await pool.query<{ action: string }>(`SELECT action FROM audit_events`);
    expect(audit.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(['partner.paid_until', 'settings.partners_enabled']),
    );
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
