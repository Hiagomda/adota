import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.js';
import {
  captureServerError,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from '../src/monitoring.js';

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

describe('limpeza do que vai para o Sentry', () => {
  it('tira a query string (latitude e longitude) da URL', () => {
    expect(scrubUrl('/posts?latitude=-1.45&longitude=-48.49#x')).toBe('/posts');
    expect(scrubUrl('https://img.eguaadota.com.br/health')).toBe(
      'https://img.eguaadota.com.br/health',
    );
  });

  it('tira e-mail, telefone, token e coordenadas do texto', () => {
    const text = scrubText(
      'Key (email)=(maria.silva@gmail.com) já existe; whatsapp 91 98888-7777, +55 (91) 3222-1100; ' +
        'Bearer abc.def-123 dev:joao@x.com ponto -1.455833, -48.490167 jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
    );
    expect(text).not.toMatch(/maria|joao|98888|3222|abc\.def|-48\.49|eyJhbG/);
    expect(text).toContain('[e-mail]');
    expect(text).toContain('[telefone]');
    expect(text).toContain('[coordenadas]');
  });

  it('não estraga id de post nem número curto', () => {
    const id = '0b8e5f0e-4f7d-4c1e-9a77-123456789012';
    expect(scrubText(`post ${id} status 404 em 23 ms`)).toBe(`post ${id} status 404 em 23 ms`);
  });

  it('remove cabeçalhos, corpo, cookies e dados da pessoa do evento', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'falha para ana@exemplo.com',
      user: { id: 'u1', email: 'ana@exemplo.com', ip_address: '200.1.2.3' },
      request: {
        url: 'https://api.eguaadota.com.br/central?latitude=-1.4&longitude=-48.4',
        query_string: 'latitude=-1.4&longitude=-48.4',
        cookies: { egua_admin: 'segredo' },
        data: { phone: '91988887777' },
        headers: {
          Authorization: 'Bearer segredo',
          Cookie: 'egua_admin=segredo',
          'X-Forwarded-For': '200.1.2.3',
          'User-Agent': 'okhttp/4',
        },
      },
      exception: { values: [{ type: 'Error', value: 'duplicado: ana@exemplo.com' }] },
      breadcrumbs: [
        { category: 'console', message: 'log com dado' },
        { category: 'http', data: { url: 'https://nominatim.org/reverse?lat=-1.4&lon=-48.4' } },
      ],
    } as ErrorEvent);

    expect(event.user).toEqual({ id: 'u1' });
    expect(event.request).toEqual({
      url: 'https://api.eguaadota.com.br/central',
      headers: { 'User-Agent': 'okhttp/4' },
    });
    expect(event.message).toBe('falha para [e-mail]');
    expect(event.exception?.values?.[0]?.value).toBe('duplicado: [e-mail]');
    expect(event.breadcrumbs).toEqual([
      { category: 'http', data: { url: 'https://nominatim.org/reverse' } },
    ]);
  });

  it('descarta trilha do console', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });
});
