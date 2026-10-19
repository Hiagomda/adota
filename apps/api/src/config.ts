import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const srcDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(srcDir, '../../../.env') });

/** Blank lines in `.env` are unset, not an empty secret. */
function blankAsUnset(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const defaults = {
  DATABASE_URL: 'postgres://patinha:patinha@localhost:5435/patinha',
  MINIO_SECRET_KEY: 'patinha-secret',
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().min(1).default(defaults.DATABASE_URL),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  AUTH_DEV_MODE: z.enum(['true', 'false']).optional(),
  FIREBASE_PROJECT_ID: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  FIREBASE_CLIENT_EMAIL: z.preprocess(blankAsUnset, z.string().email().optional()),
  FIREBASE_PRIVATE_KEY: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  MINIO_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  // Host the phone can reach. Empty means the internal endpoint, which only works on the same machine.
  MINIO_PUBLIC_ENDPOINT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  MINIO_ACCESS_KEY: z.string().min(1).default('patinha'),
  MINIO_SECRET_KEY: z.string().min(1).default(defaults.MINIO_SECRET_KEY),
  MINIO_BUCKET: z.string().min(1).default('patinha-media'),
  IMGPROXY_URL: z.string().min(1).default('http://localhost:8080'),
  IMGPROXY_KEY: z.string().default(''),
  IMGPROXY_SALT: z.string().default(''),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  ADMIN_ORIGIN: z.string().min(1).default('http://localhost:3020'),
  /** 32 bytes, base64. Encrypts TOTP secrets. Absent means staff login stays closed. */
  ADMIN_TOTP_KEY: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  /** Comma-separated IPs. Empty means the staff API does not filter by address. */
  ADMIN_IP_ALLOWLIST: z.preprocess(blankAsUnset, z.string().min(1).optional()),
  /** Comma-separated e-mails promoted to admin once Firebase has verified them. */
  OWNER_EMAILS: z.preprocess(blankAsUnset, z.string().min(3).optional()),
  /** How many reverse proxies sit in front of the API. 1 is Caddy or Coolify. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export type Env = z.infer<typeof envSchema> & { authDevMode: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse(source);
  const authDevMode =
    parsed.AUTH_DEV_MODE === 'true' ||
    (parsed.AUTH_DEV_MODE === undefined && parsed.NODE_ENV !== 'production');
  const env = { ...parsed, authDevMode };
  const unsafe = productionProblems(env);
  if (unsafe.length > 0) {
    throw new Error(`Configuração insegura para produção: ${unsafe.join('; ')}`);
  }
  return env;
}

/**
 * Em produção a API não sobe com os valores de desenvolvimento. Melhor o deploy falhar no
 * Coolify do que ficar no ar aceitando `dev:<email>` ou com a senha padrão do MinIO.
 */
export function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.authDevMode) problems.push('AUTH_DEV_MODE precisa ser false');
  if (!env.FIREBASE_PROJECT_ID) problems.push('FIREBASE_PROJECT_ID está vazio');
  if (env.DATABASE_URL === defaults.DATABASE_URL) problems.push('DATABASE_URL é o padrão local');
  if (env.MINIO_SECRET_KEY === defaults.MINIO_SECRET_KEY)
    problems.push('MINIO_SECRET_KEY é o padrão local');
  if (!env.IMGPROXY_KEY || !env.IMGPROXY_SALT) problems.push('IMGPROXY_KEY e IMGPROXY_SALT vazios');
  return problems;
}
