import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { type HealthResponse } from '@patinha/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadEnv, type Env } from './config.js';
import { getHealth, type DatabaseClient, type RedisClient } from './health.js';
import { HttpError } from './http.js';
import { createStorage } from './media.js';
import { createQueue } from './notify.js';
import { registerRoutes } from './register.js';

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

  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? [env.WEB_ORIGIN] : true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode < 500) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir.';
      return reply.code(statusCode).send({ message });
    }
    request.log.error(error);
    return reply.code(500).send({ message: 'Algo deu errado. Tente de novo.' });
  });

  app.get('/health', async (_request, reply) => {
    const body: HealthResponse = await getHealth(database, redis);
    return reply.code(body.status === 'ok' ? 200 : 503).send(body);
  });

  if (database instanceof Pool) {
    const queueRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = createQueue(queueRedis);
    await registerRoutes(app, {
      env,
      pool: database,
      queue,
      storage: createStorage(env),
    });
    app.addHook('onClose', async () => {
      await queue.close();
      queueRedis.disconnect();
    });
  }

  app.addHook('onClose', async () => {
    await database.end();
    redis.disconnect();
  });

  return app;
}
