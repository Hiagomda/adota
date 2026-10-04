import type { ServiceCheck } from '@patinha/shared';
import { buildHealthResponse, type HealthResponse } from '@patinha/shared';

export interface DatabaseClient {
  query(sql: string): Promise<unknown>;
  end(): Promise<void>;
}

export interface RedisClient {
  ping(): Promise<string>;
  disconnect(): void;
}

export async function checkDatabase(database: DatabaseClient): Promise<ServiceCheck> {
  try {
    await database.query('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function checkRedis(redis: RedisClient): Promise<ServiceCheck> {
  try {
    const result = await redis.ping();
    return result === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function getHealth(
  database: DatabaseClient,
  redis: RedisClient,
): Promise<HealthResponse> {
  const [databaseStatus, redisStatus] = await Promise.all([
    checkDatabase(database),
    checkRedis(redis),
  ]);

  return buildHealthResponse({ database: databaseStatus, redis: redisStatus });
}
