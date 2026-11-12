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

async function insertUser(
  email: string,
  handle: string,
  role = 'user',
  verified = false,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, verified)
     VALUES ($1, $2, $2, $3, 'Belém', $4) RETURNING id`,
    [`dev:${email}`, handle, role, verified],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

async function staffToken(userId: string): Promise<string> {
  const token = `adm.teste-${userId}`;
  await pool.query(
    `INSERT INTO admin_sessions (user_id, token_hash, csrf_hash, expires_at, idle_expires_at)
     VALUES ($1, $2, 'x', now() + interval '1 hour', now() + interval '30 minutes')`,
    [userId, createHash('sha256').update(token).digest('hex')],
  );
  return token;
}

const bowl = {
  kind: 'both',
  relation: 'mine',
  addressText: 'Praça Batista Campos, lado da Padre Eutíquio',
  note: 'Abasteço de manhã e no fim da tarde.',
  latitude: -1.4602,
  longitude: -48.4897,
};

const belemArea = '?west=-48.6&south=-1.6&east=-48.3&north=-1.2';

describe('feed points', () => {
  let app: FastifyInstance;

  const create = (email: string, payload: Record<string, unknown> = bowl) =>
    app.inject({ method: 'POST', url: '/feed-points', headers: auth(email), payload });

  const onMap = async (query = belemArea) => {
    const response = await app.inject({ method: 'GET', url: `/feed-points${query}` });
    expect(response.statusCode).toBe(200);
    return response.json().points as { id: string; kind: string; lastEmptyAt: string | null }[];
  };

  const review = (token: string, id: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/admin/v1/feed-points/${id}/review`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  const report = (email: string, id: string, value: string) =>
    app.inject({
      method: 'POST',
      url: `/feed-points/${id}/report`,
      headers: auth(email),
      payload: { report: value },
    });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE feed_point_reports, feed_points, audit_events, admin_sessions, notifications,
        users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('shows a point on the map only after the team approves it', async () => {
    const ownerId = await insertUser('maria@egua.local', 'maria');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');

    expect(
      (await app.inject({ method: 'POST', url: '/feed-points', payload: bowl })).statusCode,
    ).toBe(401);
    const created = await create('maria@egua.local');
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe('pending');
    const id = created.json().id as string;
    expect(await onMap()).toEqual([]);

    const token = await staffToken(modId);
    const pending = await app.inject({
      method: 'GET',
      url: '/admin/v1/feed-points?filter=pending',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pending.json().points).toMatchObject([{ id, ownerHandle: 'maria', goneReports: 0 }]);
    expect((await review(token, id, { action: 'reject' })).statusCode).toBe(400);
    expect((await review(token, id, { action: 'approve' })).statusCode).toBe(200);
    expect((await review(token, id, { action: 'approve' })).statusCode).toBe(409);

    const listed = await onMap();
    expect(listed.map((item) => item.id)).toEqual([id]);
    expect(listed[0]).not.toHaveProperty('ownerHandle');
    expect(await onMap('?west=-48.48&south=-1.44&east=-48.40&north=-1.40')).toEqual([]);
    expect(await onMap(`${belemArea}&kind=water`)).toHaveLength(1);

    const notice = await pool.query<{ type: string; user_id: string }>(
      `SELECT type, user_id FROM notifications`,
    );
    expect(notice.rows).toEqual([{ type: 'feed_point_review', user_id: ownerId }]);
    const audit = await pool.query<{ action: string }>(`SELECT action FROM audit_events`);
    expect(audit.rows.map((row) => row.action)).toContain('feed_point.review_approve');
  });

  it('puts a verified profile on the map right away and refuses points outside Belém', async () => {
    await insertUser('ong@egua.local', 'ong', 'user', true);
    const created = await create('ong@egua.local');
    expect(created.json().status).toBe('approved');
    expect(await onMap()).toHaveLength(1);
    const outside = await create('ong@egua.local', {
      ...bowl,
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(outside.statusCode).toBe(400);
  });

  it('lets people tell the point is empty, warns the keeper once and hides it after three "gone"', async () => {
    const ownerId = await insertUser('maria@egua.local', 'maria', 'user', true);
    for (const name of ['ana', 'joao', 'lia']) await insertUser(`${name}@egua.local`, name);
    const id = (await create('maria@egua.local')).json().id as string;

    expect((await report('ana@egua.local', id, 'empty')).statusCode).toBe(200);
    await report('joao@egua.local', id, 'empty');
    expect((await onMap())[0]?.lastEmptyAt).not.toBeNull();
    const warned = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM notifications WHERE type = 'feed_point_empty'`,
    );
    expect(warned.rows).toEqual([{ user_id: ownerId }]);

    expect((await report('ana@egua.local', id, 'refilled')).statusCode).toBe(200);
    expect((await report('ana@egua.local', id, 'nope')).statusCode).toBe(400);

    await report('ana@egua.local', id, 'gone');
    // A mesma pessoa repetindo não conta duas vezes.
    await report('ana@egua.local', id, 'gone');
    await report('joao@egua.local', id, 'gone');
    expect(await onMap()).toHaveLength(1);
    const third = await report('lia@egua.local', id, 'gone');
    expect(third.json().hidden).toBe(true);
    expect(await onMap()).toEqual([]);

    const mine = await app.inject({
      method: 'GET',
      url: '/feed-points/mine',
      headers: auth('maria@egua.local'),
    });
    expect(mine.json().points[0]).toMatchObject({ status: 'pending', visible: false });
  });

  it('only the owner edits or deletes, and editing sends it back to review', async () => {
    await insertUser('maria@egua.local', 'maria');
    await insertUser('ana@egua.local', 'ana');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');
    const id = (await create('maria@egua.local')).json().id as string;
    await review(await staffToken(modId), id, { action: 'approve' });

    const stranger = await app.inject({
      method: 'PATCH',
      url: `/feed-points/${id}`,
      headers: auth('ana@egua.local'),
      payload: bowl,
    });
    expect(stranger.statusCode).toBe(404);
    const edited = await app.inject({
      method: 'PATCH',
      url: `/feed-points/${id}`,
      headers: auth('maria@egua.local'),
      payload: { ...bowl, kind: 'water' },
    });
    expect(edited.json().status).toBe('pending');
    expect(await onMap()).toEqual([]);

    const strangerDelete = await app.inject({
      method: 'DELETE',
      url: `/feed-points/${id}`,
      headers: auth('ana@egua.local'),
    });
    expect(strangerDelete.statusCode).toBe(404);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/feed-points/${id}`,
      headers: auth('maria@egua.local'),
    });
    expect(deleted.statusCode).toBe(200);
  });
});
