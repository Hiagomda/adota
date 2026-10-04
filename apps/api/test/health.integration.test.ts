import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /health against local services', () => {
  it('returns ok when Postgres and Redis from Docker Compose are up', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });

    await app.close();
  });
});
