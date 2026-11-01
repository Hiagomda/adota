import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function insertUser(handle: string, role = 'user', verified = false): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, verified)
     VALUES ($1, $2, $2, $3, 'Belém', $4) RETURNING id`,
    [`dev:${handle}@egua.local`, handle, role, verified],
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

function belemDay(offsetDays: number): string {
  const date = new Date(Date.now() - 3 * 3_600_000 + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const fair = () => ({
  title: 'Feira de adoção na Praça Batista Campos',
  category: 'adoption_fair',
  placeLabel: 'Praça Batista Campos',
  latitude: -1.4569,
  longitude: -48.4889,
  startsAt: `${belemDay(7)}T09:00:00-03:00`,
  endsAt: `${belemDay(7)}T13:00:00-03:00`,
});

const campaign = () => ({
  title: 'Castração da colônia do Guamá',
  purpose: 'Castrar 20 gatos da colônia do Guamá, com exames e remédio pós-operatório.',
  goalCents: 300_000,
  deadline: belemDay(30),
  pixKey: 'ong@egua.local',
});

describe('staff create', () => {
  let app: FastifyInstance;

  const post = (token: string, url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE campaign_events, campaign_entries, campaigns, event_changes, adoption_events,
        audit_events, admin_sessions, notifications, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('publishes an event from the panel straight to the agenda', async () => {
    const adminId = await insertUser('equipe.hiago', 'superadmin');
    const token = await staffToken(adminId);

    expect(
      (await app.inject({ method: 'POST', url: '/admin/v1/events', payload: fair() })).statusCode,
    ).toBe(401);
    const created = await post(token, '/admin/v1/events', fair());
    expect(created.statusCode).toBe(201);
    expect(created.json().reviewStatus).toBe('published');

    const listed = await app.inject({ method: 'GET', url: '/events' });
    expect(listed.json().events.map((item: { id: string }) => item.id)).toEqual([
      created.json().id,
    ]);
    const audit = await pool.query(`SELECT action FROM audit_events WHERE action = 'event.create'`);
    expect(audit.rowCount).toBe(1);
  });

  it('keeps a moderator event without the seal waiting for review', async () => {
    const modId = await insertUser('equipe.mod', 'moderator');
    const token = await staffToken(modId);
    expect((await post(token, '/admin/v1/events', fair())).statusCode).toBe(403);
    const community = await post(token, '/admin/v1/events', { ...fair(), category: 'community' });
    expect(community.statusCode).toBe(201);
    expect(community.json().reviewStatus).toBe('pending');
  });

  it('opens a campaign for a verified owner and logs the team as author', async () => {
    const adminId = await insertUser('equipe.hiago', 'superadmin');
    const ownerId = await insertUser('ong.guama', 'ngo', true);
    await insertUser('sem.selo');
    const token = await staffToken(adminId);

    expect(
      (await post(token, '/admin/v1/campaigns', { ...campaign(), ownerHandle: '@sem.selo' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await post(token, '/admin/v1/campaigns', { ...campaign(), ownerHandle: 'ninguem' }))
        .statusCode,
    ).toBe(404);

    const created = await post(token, '/admin/v1/campaigns', {
      ...campaign(),
      ownerHandle: '@ong.guama',
    });
    expect(created.statusCode).toBe(201);
    const row = await pool.query<{ owner_id: string }>(
      `SELECT owner_id FROM campaigns WHERE id = $1`,
      [created.json().id],
    );
    expect(row.rows[0]?.owner_id).toBe(ownerId);
    const log = await pool.query<{ actor_kind: string; actor_id: string }>(
      `SELECT actor_kind, actor_id FROM campaign_events WHERE campaign_id = $1`,
      [created.json().id],
    );
    expect(log.rows).toEqual([{ actor_kind: 'staff', actor_id: adminId }]);
    const notice = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [ownerId]);
    expect(notice.rowCount).toBe(1);

    const own = await post(token, '/admin/v1/campaigns', campaign());
    expect(own.statusCode).toBe(201);
  });

  it('blocks campaign creation without the finance permission', async () => {
    const modId = await insertUser('equipe.mod', 'moderator');
    const token = await staffToken(modId);
    expect((await post(token, '/admin/v1/campaigns', campaign())).statusCode).toBe(403);
  });
});
