import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.js';
import { captureServerError } from '../src/monitoring.js';

describe('monitoramento', () => {
  it('SENTRY_DSN em branco desliga o envio', () => {
    const env = loadEnv({ NODE_ENV: 'test', SENTRY_DSN: '  ' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('recusa DSN que não é endereço', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', SENTRY_DSN: 'abc' })).toThrow();
  });

  it('sem Sentry ligado, capturar um erro não faz nada nem lança', () => {
    expect(() => captureServerError(new Error('x'), { where: 'teste' })).not.toThrow();
  });
});
