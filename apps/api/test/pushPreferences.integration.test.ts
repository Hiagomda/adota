import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { notifyComment, notifyStatusChange } from '../src/notify.js';

// Captura os envios em vez de chamar o Firebase.
const sent = vi.hoisted(() => [] as string[][]);
vi.mock('firebase-admin', () => {
  const messaging = () => ({
    sendEachForMulticast: async ({ tokens }: { tokens: string[] }) => {
      sent.push(tokens);
      return { responses: tokens.map(() => ({ success: true })) };
    },
  });
  return {
    apps: [{}],
    messaging,
    default: { apps: [{}], messaging },
  };
});

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pushEnv = { ...env, FIREBASE_PROJECT_ID: 'egua-teste' };
const pool = new Pool({ connectionString: env.DATABASE_URL });

async function insertUser(email: string, handle: string, token: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, fcm_tokens)
     VALUES ($1, $2, $2, 'user', 'Belém', ARRAY[$3]::text[]) RETURNING id`,
    [`dev:${email}`, handle, token],
  );
  return result.rows[0]!.id;
}

describe('push respeita as preferências de cada pessoa', () => {
  let app: FastifyInstance;
  let authorId: string;
  let postId: string;

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE TABLE users RESTART IDENTITY CASCADE`);
    sent.length = 0;
    authorId = await insertUser('autora@egua.local', 'autora', 'token-da-autora');
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { authorization: 'Bearer dev:autora@egua.local' },
      payload: {
        type: 'rescue_alert',
        species: 'cat',
        size: 'small',
        urgency: 'high',
        description: 'Gato preso no muro.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${authorId}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(response.statusCode).toBe(201);
    postId = response.json().id as string;
    sent.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('comentário chega por push para quem deixou os avisos ligados', async () => {
    const commenter = await insertUser('vizinho@egua.local', 'vizinho', 'token-vizinho');
    await notifyComment(pool, pushEnv, postId, commenter, 'Vi ele ontem', null);
    expect(sent).toEqual([['token-da-autora']]);
    const stored = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1`, [authorId]);
    expect(stored.rowCount).toBeGreaterThan(0);
  });

  it('avisos desligados: fica só em Alertas, sem push', async () => {
    await pool.query(`UPDATE users SET notifications_enabled = false WHERE id = $1`, [authorId]);
    const commenter = await insertUser('vizinho@egua.local', 'vizinho', 'token-vizinho');
    await notifyComment(pool, pushEnv, postId, commenter, 'Vi ele ontem', null);
    await notifyStatusChange(pool, pushEnv, postId, 'rescued');
    expect(sent).toEqual([]);
    const stored = await pool.query(`SELECT type FROM notifications WHERE user_id = $1`, [
      authorId,
    ]);
    expect(stored.rows.map((row) => row.type).sort()).toEqual(['comment', 'status']);
  });

  it('no horário de silêncio: sem push', async () => {
    // Silêncio começando na hora atual de Belém e indo duas horas adiante.
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Belem',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    await pool.query(
      `UPDATE users SET quiet_hours_start = $2, quiet_hours_end = $3 WHERE id = $1`,
      [authorId, hour, (hour + 2) % 24],
    );
    await notifyStatusChange(pool, pushEnv, postId, 'rescued');
    expect(sent).toEqual([]);
  });
});
