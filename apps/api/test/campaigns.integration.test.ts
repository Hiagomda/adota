import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { anonymizeUser } from '../src/accounts.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

async function insertUser(
  email: string,
  handle: string,
  options: { verified?: boolean; role?: string } = {},
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, verified)
     VALUES ($1, $2, $2, $3, 'Belém', $4) RETURNING id`,
    [`dev:${email}`, handle, options.role ?? 'user', options.verified ?? false],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

let photo = 0;
function upload(userId: string): string {
  photo += 1;
  return `uploads/${userId}/00000000-0000-4000-8000-${String(photo).padStart(12, '0')}.jpg`;
}

function inDays(days: number): string {
  const date = new Date(Date.now() - 3 * 3_600_000);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = () => inDays(0);

const ONG = 'ong@egua.local';
const DONOR = 'doadora@egua.local';
const OTHER = 'vizinho@egua.local';
const ADMIN = 'equipe@egua.local';

describe('transparent campaigns', () => {
  let app: FastifyInstance;
  let ongId: string;
  let donorId: string;

  const create = (email: string, payload: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: auth(email),
      payload: {
        title: 'Cirurgia da Mel',
        purpose: 'A Mel quebrou a pata e precisa de cirurgia, raio-x e duas semanas de internação.',
        goalCents: 150_000,
        deadline: inDays(30),
        pixKey: 'pix@ong.org',
        ...payload,
      },
    });

  const detail = (id: string, email?: string) =>
    app.inject({ method: 'GET', url: `/campaigns/${id}`, headers: email ? auth(email) : {} });

  const pledge = (id: string, email: string, payload: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/campaigns/${id}/pledges`,
      headers: auth(email),
      payload: { amountCents: 5_000, occurredOn: today(), ...payload },
    });

  const post = (url: string, email: string, payload: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url, headers: auth(email), payload });

  async function newCampaign(payload: Record<string, unknown> = {}): Promise<string> {
    const created = await create(ONG, payload);
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        campaign_events, campaign_entries, campaigns,
        animal_links, animal_custody, animal_health_records,
        notifications, reports, help_requests, sightings, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
    ongId = await insertUser(ONG, 'ong', { verified: true, role: 'ngo' });
    donorId = await insertUser(DONOR, 'doadora');
    await insertUser(OTHER, 'vizinho');
    await insertUser(ADMIN, 'equipe', { role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('only verified profiles open a campaign, and the Pix shows while it is open', async () => {
    const refused = await create(OTHER);
    expect(refused.statusCode).toBe(403);

    const id = await newCampaign();
    const open = await detail(id);
    expect(open.statusCode).toBe(200);
    expect(open.json()).toMatchObject({
      phase: 'active',
      pixKey: 'pix@ong.org',
      goalCents: 150_000,
      totals: { raisedCents: 0, spentCents: 0, pendingCount: null },
      permissions: { canPledge: false, isOwner: false },
    });
    expect(open.json().history[0].summary).toBe('Campanha criada');

    const list = await app.inject({ method: 'GET', url: '/campaigns' });
    expect(list.json().campaigns.map((item: { id: string }) => item.id)).toEqual([id]);
  });

  it('never counts a pledge until the owner confirms it with a receipt', async () => {
    const id = await newCampaign();
    const notice = await pledge(id, DONOR, { clientKey: 'pledge-key-1', showName: true });
    expect(notice.statusCode).toBe(201);
    const entryId = notice.json().id as string;

    // Reenviar a mesma chave não cria outro aviso.
    const again = await pledge(id, DONOR, { clientKey: 'pledge-key-1', showName: true });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(entryId);

    const publicView = await detail(id, OTHER);
    expect(publicView.json().totals.raisedCents).toBe(0);
    expect(publicView.json().entries).toEqual([]);

    const ownerView = await detail(id, ONG);
    expect(ownerView.json().totals).toMatchObject({
      raisedCents: 0,
      pendingCents: 5_000,
      pendingCount: 1,
    });
    const notified = await pool.query(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'campaign'`,
      [ongId],
    );
    expect(notified.rows[0]?.payload.route).toBe(`/campanha/${id}`);

    const noReceipt = await post(`/campaigns/${id}/entries/${entryId}/confirm`, ONG);
    expect(noReceipt.statusCode).toBe(400);

    const otherId = (
      await pool.query<{ id: string }>(`SELECT id FROM users WHERE handle = 'vizinho'`)
    ).rows[0]?.id as string;
    const notOwner = await post(`/campaigns/${id}/entries/${entryId}/confirm`, OTHER, {
      receiptKey: upload(otherId),
    });
    expect(notOwner.statusCode).toBe(403);

    // Dois toques em confirmar ao mesmo tempo: um confirma, o outro vê que já foi.
    const receipt = upload(ongId);
    const both = await Promise.all([
      post(`/campaigns/${id}/entries/${entryId}/confirm`, ONG, { receiptKey: receipt }),
      post(`/campaigns/${id}/entries/${entryId}/confirm`, ONG, { receiptKey: receipt }),
    ]);
    expect(both.map((item) => item.statusCode).sort()).toEqual([200, 409]);

    const confirmed = await detail(id, OTHER);
    expect(confirmed.json().totals).toMatchObject({ raisedCents: 5_000, confirmedDonations: 1 });
    expect(confirmed.json().entries[0]).toMatchObject({
      status: 'confirmed',
      who: 'doadora',
      hasReceipt: true,
      receipt: null,
    });
    expect(confirmed.json().history[0].summary).toContain('confirmada com comprovante');

    const donorView = await detail(id, DONOR);
    expect(donorView.json().entries[0].receipt).not.toBeNull();
    const thanks = await pool.query(
      `SELECT payload FROM notifications WHERE user_id = $1 AND type = 'campaign'`,
      [donorId],
    );
    expect(thanks.rows[0]?.payload.title).toBe('Doação confirmada');
  });

  it('refuses a receipt uploaded by another account', async () => {
    const id = await newCampaign();
    const stolen = await pledge(id, DONOR, { receiptKey: upload(ongId) });
    expect(stolen.statusCode).toBe(400);
  });

  it('keeps expenses public, and a void stays visible with its reason', async () => {
    const id = await newCampaign();
    const expense = await post(`/campaigns/${id}/entries`, ONG, {
      kind: 'expense',
      amountCents: 35_000,
      description: 'Raio-x da pata',
      occurredOn: today(),
      receiptKey: upload(ongId),
    });
    expect(expense.statusCode).toBe(201);
    const donation = await post(`/campaigns/${id}/entries`, ONG, {
      kind: 'donation',
      amountCents: 50_000,
      description: 'Doação em dinheiro na feira',
      occurredOn: today(),
      receiptKey: upload(ongId),
    });
    expect(donation.statusCode).toBe(201);

    const view = await detail(id, OTHER);
    expect(view.json().totals).toMatchObject({
      raisedCents: 50_000,
      spentCents: 35_000,
      balanceCents: 15_000,
    });
    const expenseRow = view
      .json()
      .entries.find((entry: { kind: string }) => entry.kind === 'expense');
    expect(expenseRow.receipt).not.toBeNull();

    const shortReason = await post(`/campaigns/${id}/entries/${donation.json().id}/void`, ONG, {
      reason: 'erro',
    });
    expect(shortReason.statusCode).toBe(400);
    const voided = await post(`/campaigns/${id}/entries/${donation.json().id}/void`, ONG, {
      reason: 'Valor lançado em dobro por engano',
    });
    expect(voided.statusCode).toBe(200);

    const after = await detail(id, OTHER);
    expect(after.json().totals.raisedCents).toBe(0);
    const voidedRow = after
      .json()
      .entries.find((entry: { id: string }) => entry.id === donation.json().id);
    expect(voidedRow).toMatchObject({
      status: 'voided',
      decisionNote: 'Valor lançado em dobro por engano',
    });
  });

  it('records every edit with the reason, before and after', async () => {
    const id = await newCampaign();
    const noReason = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${id}`,
      headers: auth(ONG),
      payload: { goalCents: 200_000 },
    });
    expect(noReason.statusCode).toBe(400);
    const stranger = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${id}`,
      headers: auth(OTHER),
      payload: { goalCents: 200_000, reason: 'Quero mudar a meta' },
    });
    expect(stranger.statusCode).toBe(403);
    const edited = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${id}`,
      headers: auth(ONG),
      payload: { goalCents: 200_000, reason: 'A clínica mandou orçamento novo' },
    });
    expect(edited.statusCode).toBe(200);
    const view = await detail(id);
    expect(view.json().goalCents).toBe(200_000);
    expect(view.json().history[0]).toMatchObject({
      actor: 'Responsável',
      note: 'A clínica mandou orçamento novo',
      summary: 'Campanha editada: meta de R$ 1.500,00 para R$ 2.000,00',
    });
  });

  it('closes only after every pledge is answered, then tells who donated', async () => {
    const id = await newCampaign();
    const first = await pledge(id, DONOR, { receiptKey: upload(donorId) });
    const second = await pledge(id, OTHER, { amountCents: 2_000 });

    const early = await post(`/campaigns/${id}/close`, ONG, {
      note: 'Cirurgia feita, a Mel já está em casa e o saldo foi para a ração.',
    });
    expect(early.statusCode).toBe(409);

    expect(
      (await post(`/campaigns/${id}/entries/${first.json().id}/confirm`, ONG)).statusCode,
    ).toBe(200);
    expect(
      (
        await post(`/campaigns/${id}/entries/${second.json().id}/reject`, ONG, {
          reason: 'Não apareceu no extrato',
        })
      ).statusCode,
    ).toBe(200);

    const closed = await post(`/campaigns/${id}/close`, ONG, {
      note: 'Cirurgia feita, a Mel já está em casa e o saldo foi para a ração.',
    });
    expect(closed.statusCode).toBe(200);

    const view = await detail(id);
    expect(view.json()).toMatchObject({ phase: 'closed', pixKey: null });
    expect((await pledge(id, DONOR)).statusCode).toBe(409);
    const told = await pool.query(
      `SELECT payload FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [donorId],
    );
    expect(told.rows[0]?.payload.title).toBe('Prestação de contas publicada');

    const ended = await app.inject({ method: 'GET', url: '/campaigns?status=ended' });
    expect(ended.json().campaigns).toHaveLength(1);
  });

  it('stops taking pledges after the deadline in Belém', async () => {
    const id = await newCampaign();
    await pool.query(`UPDATE campaigns SET deadline = $2 WHERE id = $1`, [id, inDays(-1)]);
    const view = await detail(id);
    expect(view.json()).toMatchObject({ phase: 'ended', pixKey: null });
    expect((await pledge(id, DONOR)).statusCode).toBe(409);
    const open = await app.inject({ method: 'GET', url: '/campaigns' });
    expect(open.json().campaigns).toEqual([]);
  });

  it('suspends a reported campaign when the team accepts the report', async () => {
    const id = await newCampaign();
    const report = await post('/reports', OTHER, {
      targetType: 'campaign',
      targetId: id,
      reason: 'Já vi essa mesma foto em outra vaquinha.',
    });
    expect(report.statusCode).toBe(201);
    const queue = await app.inject({
      method: 'GET',
      url: '/admin/reports',
      headers: auth(ADMIN),
    });
    const reportId = queue.json().reports[0].id as string;
    const hidden = await post(`/admin/reports/${reportId}`, ADMIN, { action: 'hide' });
    expect(hidden.statusCode).toBe(200);

    const view = await detail(id);
    expect(view.json()).toMatchObject({ phase: 'suspended', pixKey: null });
    expect(view.json().history[0].actor).toBe('Equipe');
    expect((await app.inject({ method: 'GET', url: '/campaigns' })).json().campaigns).toEqual([]);
    const edit = await app.inject({
      method: 'PATCH',
      url: `/campaigns/${id}`,
      headers: auth(ONG),
      payload: { title: 'Cirurgia urgente da Mel', reason: 'Título mais claro para a campanha' },
    });
    expect(edit.statusCode).toBe(409);
  });

  it('links to the animal passport and avoids a second open campaign for it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth(ONG),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorra caramelo com a pata machucada.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: upload(ongId) }],
      },
    });
    expect(created.statusCode).toBe(201);
    const postId = created.json().id as string;
    const id = await newCampaign({ postId });
    const view = await detail(id);
    expect(view.json().post.id).toBe(postId);
    const animalId = view.json().animal.id as string;

    const byAnimal = await app.inject({ method: 'GET', url: `/campaigns?animalId=${animalId}` });
    expect(byAnimal.json().campaigns.map((item: { id: string }) => item.id)).toEqual([id]);

    const duplicate = await create(ONG, { animalId });
    expect(duplicate.statusCode).toBe(409);
  });

  it('keeps the history append-only', async () => {
    const id = await newCampaign();
    await expect(
      pool.query(`UPDATE campaign_events SET note = 'mexido' WHERE campaign_id = $1`, [id]),
    ).rejects.toThrow(/só de inclusão/);
    await expect(
      pool.query(`DELETE FROM campaign_events WHERE campaign_id = $1`, [id]),
    ).rejects.toThrow(/só de inclusão/);
  });

  it('drops the donor name and pending pledges when the account is deleted', async () => {
    const id = await newCampaign();
    await pledge(id, DONOR, { showName: true });
    await anonymizeUser(pool, donorId);
    const view = await detail(id, ONG);
    expect(view.json().totals.pendingCount).toBe(0);
    expect(view.json().entries[0]).toMatchObject({ status: 'rejected', who: 'Doação anônima' });

    await anonymizeUser(pool, ongId);
    const closed = await detail(id);
    expect(closed.json().phase).toBe('closed');
  });
});
