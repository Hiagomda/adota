import { describe, expect, it } from 'vitest';
import {
  BACKUP_MAX_AGE_MS,
  RESTORE_TEST_MAX_AGE_MS,
  describeFailures,
  runChecks,
  type HeartbeatDeps,
} from '../src/heartbeat.js';

const hour = 3_600_000;

function deps(overrides: Partial<HeartbeatDeps> = {}): HeartbeatDeps {
  return {
    env: {
      MINIO_ENDPOINT: 'http://minio:9000',
      IMGPROXY_URL: 'https://img.eguaadota.com.br/',
      HEARTBEAT_URLS: 'https://eguaadota.com.br/, https://admin.eguaadota.com.br/?x=1',
      HEARTBEAT_BACKUP_DIR: '/backups',
      HEARTBEAT_OFFSITE_FILE: '/offsite/ultimo-envio.txt',
    },
    database: { query: async () => ({}), end: async () => {} },
    redis: { ping: async () => 'PONG', disconnect: () => {} },
    fetchUrl: async () => 200,
    fileAge: async () => 2 * hour,
    freeDiskRatio: async () => 0.5,
    ...overrides,
  };
}

describe('vigia da VPS', () => {
  it('tudo bem: nenhuma falha', async () => {
    const results = await runChecks(deps());
    expect(results.map((r) => r.name)).toEqual([
      'banco',
      'redis',
      'minio',
      'fotos',
      'eguaadota.com.br/',
      'admin.eguaadota.com.br/',
      'backup',
      'restauração',
      'disco',
      'backup externo',
    ]);
    expect(describeFailures(results)).toBe('');
  });

  it('acusa banco fora, endereço com erro, backup velho e disco cheio', async () => {
    const results = await runChecks(
      deps({
        database: {
          query: async () => {
            throw new Error('ECONNREFUSED');
          },
          end: async () => {},
        },
        fetchUrl: async (url) => (url.includes('admin') ? 502 : 200),
        fileAge: async (path) =>
          path.endsWith('ultimo-backup.txt') ? BACKUP_MAX_AGE_MS + hour : hour,
        freeDiskRatio: async () => 0.04,
      }),
    );
    expect(describeFailures(results)).toBe(
      'banco, admin.eguaadota.com.br/ (HTTP 502), backup (último bom há 27 h), disco (4% livre)',
    );
  });

  it('endereço que não responde vira falha, não exceção', async () => {
    const results = await runChecks(
      deps({
        fetchUrl: async () => {
          throw new Error('timeout');
        },
      }),
    );
    expect(results.find((r) => r.name === 'fotos')).toMatchObject({ ok: false });
  });

  it('sem backup registrado é falha; envio externo nunca feito é só "desligado"', async () => {
    const results = await runChecks(deps({ fileAge: async () => null }));
    expect(results.find((r) => r.name === 'backup')).toMatchObject({ ok: false });
    expect(results.find((r) => r.name === 'backup externo')).toMatchObject({
      ok: true,
      detail: 'desligado',
    });
  });

  it('teste de restauração velho é falha; nunca rodado ainda não', async () => {
    const velho = await runChecks(
      deps({
        fileAge: async (path) =>
          path.endsWith('ultimo-teste-restauracao.txt') ? RESTORE_TEST_MAX_AGE_MS + hour : hour,
      }),
    );
    expect(describeFailures(velho)).toBe('restauração (último teste há 193 h)');
    const nunca = await runChecks(
      deps({
        fileAge: async (path) => (path.endsWith('ultimo-teste-restauracao.txt') ? null : hour),
      }),
    );
    expect(describeFailures(nunca)).toBe('');
  });

  it('sem pasta de backup configurada não confere backup nem disco', async () => {
    const base = deps();
    const results = await runChecks({
      ...base,
      env: { ...base.env, HEARTBEAT_BACKUP_DIR: undefined, HEARTBEAT_OFFSITE_FILE: undefined },
    });
    expect(results.some((r) => r.name === 'backup' || r.name === 'disco')).toBe(false);
  });
});
