import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Env } from '../src/config.js';
import type { DatabaseClient, RedisClient } from '../src/health.js';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 3010,
  DATABASE_URL: 'postgres://patinha:patinha@localhost:5435/patinha',
  REDIS_URL: 'redis://localhost:6380',
};

function createClients(
  databaseUp: boolean,
  redisUp: boolean,
): {
  database: DatabaseClient;
  redis: RedisClient;
} {
  return {
    database: {
      query: async () => {
        if (!databaseUp) {
          throw new Error('database unavailable');
        }
        return { rows: [{ ok: 1 }] };
      },
      end: async () => {},
    },
    redis: {
      ping: async () => {
        if (!redisUp) {
          throw new Error('redis unavailable');
        }
        return 'PONG';
      },
      disconnect: () => {},
    },
  };
}

describe('GET /health', () => {
  it('returns 200 when both dependencies respond', async () => {
    const clients = createClients(true, true);
    const app = await buildApp({ env, ...clients });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
    await app.close();
  });

  it('returns 503 when a dependency is down', async () => {
    const clients = createClients(false, true);
    const app = await buildApp({ env, ...clients });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'degraded',
      checks: { database: 'error', redis: 'ok' },
    });
    await app.close();
  });
});
