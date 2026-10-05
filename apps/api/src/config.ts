import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const srcDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(srcDir, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  DATABASE_URL: z.string().min(1).default('postgres://patinha:patinha@localhost:5435/patinha'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  AUTH_DEV_MODE: z.enum(['true', 'false']).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  MINIO_ENDPOINT: z.string().min(1).default('http://localhost:9000'),
  MINIO_ACCESS_KEY: z.string().min(1).default('patinha'),
  MINIO_SECRET_KEY: z.string().min(1).default('patinha-secret'),
  MINIO_BUCKET: z.string().min(1).default('patinha-media'),
  IMGPROXY_URL: z.string().min(1).default('http://localhost:8080'),
  IMGPROXY_KEY: z.string().default(''),
  IMGPROXY_SALT: z.string().default(''),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema> & { authDevMode: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.parse(source);
  const authDevMode =
    parsed.AUTH_DEV_MODE === 'true' ||
    (parsed.AUTH_DEV_MODE === undefined && parsed.NODE_ENV !== 'production');
  return { ...parsed, authDevMode };
}
