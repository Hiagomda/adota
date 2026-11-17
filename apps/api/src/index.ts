import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { loadEnv, productionWarnings } from './config.js';
import { startHeartbeat } from './heartbeat.js';
import { captureServerError, flushMonitoring, initMonitoring } from './monitoring.js';
import { startEventReminders } from './eventReminders.js';
import { startWorker } from './notify.js';

const env = loadEnv();
initMonitoring(env);
for (const warning of productionWarnings(env)) {
  console.warn(JSON.stringify({ level: 'warn', where: 'config', msg: warning }));
}
const app = await buildApp({ env });
const workerRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const workerPool = new Pool({ connectionString: env.DATABASE_URL });
const worker = startWorker(workerRedis, workerPool, env);
const reminders = startEventReminders(workerRedis, workerPool, env);
const stopHeartbeat = startHeartbeat({ env, database: workerPool, redis: workerRedis });

const shutdown = async () => {
  stopHeartbeat();
  await worker.close();
  await reminders.close();
  await app.close();
  await workerPool.end();
  workerRedis.disconnect();
  await flushMonitoring();
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
  captureServerError(error, { where: 'startup' });
  await shutdown();
  process.exit(1);
}
