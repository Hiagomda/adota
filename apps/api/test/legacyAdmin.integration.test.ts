import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

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

async function auditActions(): Promise<string[]> {
  const result = await pool.query<{ action: string }>(
    `SELECT action FROM audit_events WHERE after->>'legacy' = 'true' ORDER BY created_at`,
  );
  return result.rows.map((row) => row.action);
}

/** Rotas antigas da equipe dentro do app: as mesmas travas do painel novo. */
describe('rotas antigas /admin/*', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE audit_events, verification_requests, notifications, reports, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('não suspende conta da equipe nem a própria, e registra a suspensão na auditoria', async () => {
    const adminId = await insertUser('dona@egua.local', 'dona', 'admin');
    const moderatorId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const userId = await insertUser('pessoa@egua.local', 'pessoa');

    const suspend = (id: string) =>
      app.inject({
        method: 'POST',
        url: `/admin/users/${id}/suspend`,
        headers: auth('dona@egua.local'),
        payload: { suspended: true },
      });

    expect((await suspend(moderatorId)).statusCode).toBe(403);
    expect((await suspend(adminId)).statusCode).toBe(403);
    expect((await suspend(userId)).statusCode).toBe(200);

    const rows = await pool.query<{ id: string; suspended: boolean }>(
      `SELECT id, suspended FROM users ORDER BY handle`,
    );
    expect(rows.rows.filter((row) => row.suspended).map((row) => row.id)).toEqual([userId]);
    expect(await auditActions()).toEqual(['user.suspend']);
  });

  it('não decide de novo um pedido de verificação já decidido', async () => {
    await insertUser('dona@egua.local', 'dona', 'admin');
    const userId = await insertUser('ong@egua.local', 'ong');
    const request = await pool.query<{ id: string }>(
      `INSERT INTO verification_requests (user_id, organization_name) VALUES ($1, 'Patas')
       RETURNING id`,
      [userId],
    );
    const id = request.rows[0]?.id;

    const decide = (action: string) =>
      app.inject({
        method: 'POST',
        url: `/admin/verifications/${id}`,
        headers: auth('dona@egua.local'),
        payload: { action, role: 'ngo' },
      });

    expect((await decide('reject')).statusCode).toBe(200);
    expect((await decide('approve')).statusCode).toBe(409);

    const user = await pool.query<{ verified: boolean; role: string }>(
      `SELECT verified, role FROM users WHERE id = $1`,
      [userId],
    );
    expect(user.rows[0]).toEqual({ verified: false, role: 'user' });
    expect(await auditActions()).toEqual(['verification.reject']);
  });

  it('não aceita denúncia contra conta da equipe nem denúncia já decidida', async () => {
    await insertUser('dona@egua.local', 'dona', 'admin');
    const moderatorId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const reporterId = await insertUser('pessoa@egua.local', 'pessoa');
    const reports = await pool.query<{ id: string }>(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason)
       VALUES ($1, 'user', $2, 'spam'), ($1, 'user', $1, 'teste')
       RETURNING id`,
      [reporterId, moderatorId],
    );
    const [againstStaff, other] = reports.rows.map((row) => row.id);

    const decide = (id: string | undefined, action: string) =>
      app.inject({
        method: 'POST',
        url: `/admin/reports/${id}`,
        headers: auth('dona@egua.local'),
        payload: { action },
      });

    expect((await decide(againstStaff, 'hide')).statusCode).toBe(403);
    expect((await decide(other, 'dismiss')).statusCode).toBe(200);
    expect((await decide(other, 'hide')).statusCode).toBe(409);

    const moderator = await pool.query<{ suspended: boolean }>(
      `SELECT suspended FROM users WHERE id = $1`,
      [moderatorId],
    );
    expect(moderator.rows[0]?.suspended).toBe(false);
    expect(await auditActions()).toEqual(['report.dismiss']);
  });
});
