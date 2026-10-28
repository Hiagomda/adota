import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const email = 'cupu@example.com';
const auth = { authorization: `Bearer dev:${email}` };

interface CupuBody {
  style: { pose: string; scene: string; accessory: string };
  level: string;
  items: { slot: string; code: string; unlocked: boolean; requirement: string }[];
}

describe('cupu style', () => {
  let app: FastifyInstance;
  let userId: string;

  const read = () => app.inject({ method: 'GET', url: '/volunteers/me/cupu', headers: auth });
  const save = (payload: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: '/volunteers/me/cupu', headers: auth, payload });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE cupu_styles, user_badges, user_xp_history, users RESTART IDENTITY CASCADE`,
    );
    const created = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ($1, 'Cupu Teste', 'cupu_teste', 'user', 'Belém') RETURNING id`,
      [`dev:${email}`],
    );
    userId = created.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('needs an account', async () => {
    const response = await app.inject({ method: 'GET', url: '/volunteers/me/cupu' });
    expect(response.statusCode).toBe(401);
  });

  it('starts with the default style and only the free items', async () => {
    const response = await read();
    expect(response.statusCode).toBe(200);
    const body = response.json<CupuBody>();
    expect(body.style).toEqual({ pose: 'sit', scene: 'creme', accessory: 'none' });
    expect(body.level).toBe('scout');
    const unlocked = body.items.filter((item) => item.unlocked).map((item) => item.code);
    expect(unlocked).toEqual(['sit', 'wave', 'creme', 'none']);
    expect(body.items.find((item) => item.code === 'party')?.requirement).toBe(
      'Chegue no nível Guardião local',
    );
  });

  it('refuses a locked item and saves nothing', async () => {
    const refused = await save({ pose: 'party', scene: 'creme', accessory: 'none' });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().message).toContain('Festeiro');
    const after = await read();
    expect(after.json<CupuBody>().style.pose).toBe('sit');
  });

  it('rejects codes outside the catalog', async () => {
    const response = await save({ pose: 'drive', scene: 'creme', accessory: 'none' });
    expect(response.statusCode).toBe(400);
  });

  it('unlocks with XP and badges and keeps the saved style', async () => {
    await pool.query(
      `INSERT INTO user_xp_history (user_id, action_type, points) VALUES ($1, 'foster', 300)`,
      [userId],
    );
    await pool.query(`INSERT INTO user_badges (user_id, badge_code) VALUES ($1, 'open_doors')`, [
      userId,
    ]);
    const saved = await save({ pose: 'party', scene: 'mangueiras', accessory: 'coracoes' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<CupuBody>().style).toEqual({
      pose: 'party',
      scene: 'mangueiras',
      accessory: 'coracoes',
    });
    const again = await save({ pose: 'home', scene: 'mangueiras', accessory: 'coracoes' });
    expect(again.json<CupuBody>().style.pose).toBe('home');
    const count = await pool.query(`SELECT count(*)::int AS n FROM cupu_styles`);
    expect(count.rows[0]?.n).toBe(1);
  });

  it('falls back to the default when a saved item is no longer unlocked', async () => {
    await pool.query(
      `INSERT INTO cupu_styles (user_id, pose, scene, accessory) VALUES ($1, 'party', 'noite', 'none')`,
      [userId],
    );
    const body = (await read()).json<CupuBody>();
    expect(body.style).toEqual({ pose: 'sit', scene: 'creme', accessory: 'none' });
  });
});
