import { stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import * as Sentry from '@sentry/node';
import type { Env } from './config.js';
import { checkDatabase, checkRedis, type DatabaseClient, type RedisClient } from './health.js';
import { monitoringEnabled } from './monitoring.js';

// Vigia de dentro da VPS. A cada 5 minutos confere banco, Redis, MinIO, fotos, os endereços
// públicos, a idade do último backup e o disco, e manda um "estou vivo" ao Sentry Crons.
// Se a VPS cair, o sinal para de chegar e o Sentry avisa por e-mail sozinho: não depende do
// agendamento do GitHub, que atrasa horas. Se algo falhar, o sinal sai como erro (também avisa).

export const HEARTBEAT_EVERY_MS = 5 * 60 * 1000;
export const MONITOR_SLUG = 'vps-egua-adota';
/** Backup diário: mais de 26 h sem um bom é falha (o de 3h de Belém não rodou). */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
/** Envio externo também é diário; 30 h dá folga para um envio lento. */
export const OFFSITE_MAX_AGE_MS = 30 * 60 * 60 * 1000;
/** Abaixo disto de espaço livre o Postgres e o MinIO começam a falhar. */
export const MIN_FREE_DISK_RATIO = 0.1;

export type CheckResult = { name: string; ok: boolean; detail?: string };

export interface HeartbeatDeps {
  env: Pick<
    Env,
    | 'MINIO_ENDPOINT'
    | 'IMGPROXY_URL'
    | 'HEARTBEAT_URLS'
    | 'HEARTBEAT_BACKUP_DIR'
    | 'HEARTBEAT_OFFSITE_FILE'
  >;
  database: DatabaseClient;
  redis: RedisClient;
  fetchUrl?: (url: string) => Promise<number>;
  fileAge?: (path: string) => Promise<number | null>;
  freeDiskRatio?: (path: string) => Promise<number>;
  now?: () => number;
}

async function defaultFetch(url: string): Promise<number> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': 'egua-adota-vigia' },
  });
  await response.arrayBuffer();
  return response.status;
}

/** Idade do arquivo em ms, ou null se ele não existe. */
async function defaultFileAge(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return Date.now() - info.mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function defaultFreeDisk(path: string): Promise<number> {
  const info = await statfs(path);
  return info.bavail / info.blocks;
}

function hours(ms: number): string {
  return `${Math.round(ms / 3_600_000)} h`;
}

/** Roda todas as conferências. Nunca lança: cada falha vira um item com ok = false. */
export async function runChecks(deps: HeartbeatDeps): Promise<CheckResult[]> {
  const fetchUrl = deps.fetchUrl ?? defaultFetch;
  const fileAge = deps.fileAge ?? defaultFileAge;
  const freeDiskRatio = deps.freeDiskRatio ?? defaultFreeDisk;
  const { env } = deps;

  const url = async (name: string, target: string): Promise<CheckResult> => {
    try {
      const status = await fetchUrl(target);
      return status >= 200 && status < 400
        ? { name, ok: true }
        : { name, ok: false, detail: `HTTP ${status}` };
    } catch (error) {
      return { name, ok: false, detail: String(error).slice(0, 120) };
    }
  };

  const checks: Promise<CheckResult>[] = [
    checkDatabase(deps.database).then((s) => ({ name: 'banco', ok: s === 'ok' })),
    checkRedis(deps.redis).then((s) => ({ name: 'redis', ok: s === 'ok' })),
    url('minio', `${env.MINIO_ENDPOINT.replace(/\/$/, '')}/minio/health/live`),
    url('fotos', `${env.IMGPROXY_URL.replace(/\/$/, '')}/health`),
  ];
  for (const target of (env.HEARTBEAT_URLS ?? '').split(',').map((u) => u.trim())) {
    if (!target) continue;
    // Nome sem query: o endereço inteiro aparece no alerta.
    checks.push(url(target.replace(/^https?:\/\//, '').split('?')[0] ?? target, target));
  }

  const backupDir = env.HEARTBEAT_BACKUP_DIR;
  if (backupDir) {
    checks.push(
      (async (): Promise<CheckResult> => {
        try {
          const age = await fileAge(join(backupDir, 'ultimo-backup.txt'));
          if (age === null)
            return { name: 'backup', ok: false, detail: 'nenhum backup registrado' };
          return age <= BACKUP_MAX_AGE_MS
            ? { name: 'backup', ok: true }
            : { name: 'backup', ok: false, detail: `último bom há ${hours(age)}` };
        } catch (error) {
          return { name: 'backup', ok: false, detail: String(error).slice(0, 120) };
        }
      })(),
      (async (): Promise<CheckResult> => {
        try {
          const free = await freeDiskRatio(backupDir);
          return free >= MIN_FREE_DISK_RATIO
            ? { name: 'disco', ok: true }
            : { name: 'disco', ok: false, detail: `${Math.round(free * 100)}% livre` };
        } catch (error) {
          return { name: 'disco', ok: false, detail: String(error).slice(0, 120) };
        }
      })(),
    );
  }

  const offsiteFile = env.HEARTBEAT_OFFSITE_FILE;
  if (offsiteFile) {
    checks.push(
      (async (): Promise<CheckResult> => {
        try {
          const age = await fileAge(offsiteFile);
          // Envio externo ainda não configurado: não é falha.
          if (age === null) return { name: 'backup externo', ok: true, detail: 'desligado' };
          return age <= OFFSITE_MAX_AGE_MS
            ? { name: 'backup externo', ok: true }
            : { name: 'backup externo', ok: false, detail: `último envio há ${hours(age)}` };
        } catch (error) {
          return { name: 'backup externo', ok: false, detail: String(error).slice(0, 120) };
        }
      })(),
    );
  }

  return Promise.all(checks);
}

export function describeFailures(results: CheckResult[]): string {
  return results
    .filter((r) => !r.ok)
    .map((r) => (r.detail ? `${r.name} (${r.detail})` : r.name))
    .join(', ');
}

/** Liga a vigia. Devolve a função que para o relógio (usada no desligamento). */
export function startHeartbeat(deps: HeartbeatDeps): () => void {
  let lastFailures = '';
  let lastAlertAt = 0;

  const tick = async () => {
    const checkInId = monitoringEnabled()
      ? Sentry.captureCheckIn(
          { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
          {
            schedule: { type: 'interval', value: 5, unit: 'minute' },
            checkinMargin: 5,
            maxRuntime: 2,
            timezone: 'America/Belem',
            failureIssueThreshold: 2,
            recoveryThreshold: 1,
          },
        )
      : undefined;
    const results = await runChecks(deps);
    const failures = describeFailures(results);
    const ok = failures === '';
    const now = (deps.now ?? Date.now)();

    if (failures !== lastFailures) {
      console.log(
        JSON.stringify({
          level: ok ? 'info' : 'warn',
          where: 'vigia',
          msg: ok ? 'tudo respondendo' : `falhando: ${failures}`,
        }),
      );
    }
    if (checkInId) {
      Sentry.captureCheckIn({ checkInId, monitorSlug: MONITOR_SLUG, status: ok ? 'ok' : 'error' });
      // Um alerta com o que falhou quando muda, e no máximo a cada 6 h enquanto continuar igual.
      if (!ok && (failures !== lastFailures || now - lastAlertAt > 6 * 3_600_000)) {
        Sentry.captureMessage(`Vigia da VPS: ${failures}`, {
          level: 'error',
          fingerprint: ['vigia', ...results.filter((r) => !r.ok).map((r) => r.name)],
          tags: { where: 'vigia' },
        });
        lastAlertAt = now;
      }
    }
    lastFailures = failures;
  };

  const run = () => {
    tick().catch((error: unknown) => {
      console.error(JSON.stringify({ level: 'error', where: 'vigia', error: String(error) }));
    });
  };
  // Primeira conferência 1 min depois de subir (os outros serviços terminam de iniciar).
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, HEARTBEAT_EVERY_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
