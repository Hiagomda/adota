import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { dispatchRescueAlert, expandRescueAlert } from '../src/notify.js';
import { migrate } from '../scripts/migrate.js';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });

/** Pessoa com casa num ponto: `km` ao norte do resgate, raio de aviso de 5 km. */
async function neighbour(email: string, km: number): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, city, base_location, alert_radius_km)
     VALUES ($1, $2, $2, 'user', 'Belém',
             ST_SetSRID(ST_MakePoint(-48.48321, -1.45234 + $3 / 111.0), 4326)::geography, 5)
     RETURNING id`,
    [`dev:${email}`, email.split('@')[0], km],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

describe('aviso de resgate e ampliação depois de 45 minutos', () => {
  let app: FastifyInstance;

  async function rescue(): Promise<string> {
    const author = await pool.query<{ id: string }>(
      `INSERT INTO users (firebase_uid, name, handle, role, city)
       VALUES ('dev:autor@egua.local', 'Autor', 'autor', 'user', 'Belém') RETURNING id`,
    );
    const created = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: auth('autor@egua.local'),
      payload: {
        species: 'dog',
        size: 'medium',
        urgency: 'high',
        description: 'Cachorro preso no canal.',
        latitude: -1.45234,
        longitude: -48.48321,
        approxLabel: 'Nazaré, Belém',
        media: [{ url: `uploads/${author.rows[0]?.id}/00000000-0000-4000-8000-000000000001.jpg` }],
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json().id as string;
  }

  const alerts = async (postId: string) =>
    (
      await pool.query<{ user_id: string }>(
        `SELECT user_id FROM notifications
         WHERE type = 'rescue_alert' AND payload->>'postId' = $1 ORDER BY user_id`,
        [postId],
      )
    ).rows.map((row) => row.user_id);

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE notifications, responses, post_media, posts, animals, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('amplia o raio para quem está mais longe, sem repetir o aviso de quem já recebeu', async () => {
    const near = await neighbour('perto@egua.local', 3);
    const far = await neighbour('longe@egua.local', 7);
    const postId = await rescue();
    await dispatchRescueAlert(pool, env, postId);
    expect(await alerts(postId)).toEqual([near]);

    await expandRescueAlert(pool, env, postId);
    expect(await alerts(postId)).toEqual([near, far].sort());
    const post = await pool.query<{ boosted: boolean }>('SELECT boosted FROM posts WHERE id = $1', [
      postId,
    ]);
    expect(post.rows[0]?.boosted).toBe(true);

    // O job repetido não manda nada de novo.
    await expandRescueAlert(pool, env, postId);
    expect(await alerts(postId)).toHaveLength(2);
  });

  it('não chama a vizinhança para um resgate que já foi resolvido', async () => {
    await neighbour('perto@egua.local', 3);
    await neighbour('longe@egua.local', 7);
    const postId = await rescue();
    const found = await app.inject({
      method: 'PATCH',
      url: `/posts/${postId}/status`,
      headers: auth('autor@egua.local'),
      payload: { status: 'rescued' },
    });
    expect(found.statusCode).toBe(200);

    await dispatchRescueAlert(pool, env, postId);
    await expandRescueAlert(pool, env, postId);
    expect(await alerts(postId)).toEqual([]);
    const post = await pool.query<{ boosted: boolean }>('SELECT boosted FROM posts WHERE id = $1', [
      postId,
    ]);
    expect(post.rows[0]?.boosted).toBe(false);
  });
});
