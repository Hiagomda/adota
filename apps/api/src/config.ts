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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
