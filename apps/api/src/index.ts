import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { loadEnv } from './config.js';
import { startWorker } from './notify.js';

const env = loadEnv();
const app = await buildApp({ env });
const workerRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const workerPool = new Pool({ connectionString: env.DATABASE_URL });
const worker = startWorker(workerRedis, workerPool, env);

const shutdown = async () => {
  await worker.close();
  await app.close();
  await workerPool.end();
  workerRedis.disconnect();
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exit(1);
}
