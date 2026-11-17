import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { hashPassword } from '../src/staff/password.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const senha = 'senha-certa-da-equipe-123';

describe('login do painel', () => {
  let app: FastifyInstance;

  const login = (username: string, password: string) =>
    app.inject({ method: 'POST', url: '/admin/v1/login', payload: { username, password } });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE TABLE staff_login_attempts, staff_passwords, admin_sessions, audit_events, users
       RESTART IDENTITY CASCADE`,
    );
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ('dev:equipe@egua.local', 'Equipe', 'equipe', 'superadmin', 'Belém') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO staff_passwords (user_id, username, password_hash) VALUES ($1, 'equipe', $2)`,
      [user.rows[0]!.id, await hashPassword(senha)],
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('quem erra muito com outro nome não tranca o login da equipe (mesmo IP)', async () => {
    const tentativas = [];
    for (let i = 0; i < 10; i += 1) tentativas.push((await login('atacante', 'errada')).statusCode);
    expect(tentativas.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(tentativas.at(-1)).toBe(429);

    const entrou = await login('equipe', senha);
    expect(entrou.statusCode).toBe(200);
    expect(entrou.json().token).toEqual(expect.any(String));
  });

  it('o mesmo usuário com senha errada demais fica bloqueado', async () => {
    for (let i = 0; i < 5; i += 1) expect((await login('equipe', 'errada')).statusCode).toBe(401);
    expect((await login('equipe', senha)).statusCode).toBe(429);
  });
});
