import { type HealthResponse } from '@patinha/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadEnv, type Env } from './config.js';
import { getHealth, type DatabaseClient, type RedisClient } from './health.js';

export interface AppDependencies {
  env?: Env;
  database?: DatabaseClient;
  redis?: RedisClient;
}

function createRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
}

export async function buildApp(dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const env = dependencies.env ?? loadEnv();
  const database =
    dependencies.database ??
    new Pool({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
    });
  const redis = dependencies.redis ?? createRedis(env.REDIS_URL);

  if (!dependencies.redis && redis instanceof Redis) {
    try {
      await redis.connect();
    } catch {
      // /health reports Redis as down instead of crashing the process.
    }
  }

  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  app.get('/health', async (_request, reply) => {
    const body: HealthResponse = await getHealth(database, redis);
    return reply.code(body.status === 'ok' ? 200 : 503).send(body);
  });

  app.addHook('onClose', async () => {
    await database.end();
    redis.disconnect();
  });

  return app;
}
