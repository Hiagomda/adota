import { describe, expect, it } from 'vitest';
import { buildHealthResponse } from './health.js';

describe('buildHealthResponse', () => {
  it('returns ok when database and redis are reachable', () => {
    expect(buildHealthResponse({ database: 'ok', redis: 'ok' })).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('returns degraded when a dependency is down', () => {
    expect(buildHealthResponse({ database: 'error', redis: 'ok' }).status).toBe('degraded');
    expect(buildHealthResponse({ database: 'ok', redis: 'error' }).status).toBe('degraded');
  });
});
