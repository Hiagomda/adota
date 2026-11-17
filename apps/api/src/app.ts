import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { type HealthResponse } from '@patinha/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { loadEnv, type Env } from './config.js';
import { getHealth, type DatabaseClient, type RedisClient } from './health.js';
import { HttpError } from './http.js';
import { createStorage } from './media.js';
import { captureServerError } from './monitoring.js';
import { createQueue } from './notify.js';
import { registerRoutes } from './register.js';

/** Proxies da própria VPS: rede interna do Docker e loopback. Nunca um IP público. */
const privateProxies = ['loopback', 'linklocal', 'uniquelocal'];

/** Limite de tempo de cada consulta feita pela API (o worker usa outro pool, sem limite). */
export const STATEMENT_TIMEOUT_MS = 15_000;

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
      // Nenhuma consulta de requisição prende uma conexão por minutos: com 10 conexões no pool,
      // poucas consultas lentas derrubavam a API inteira (tudo respondia 500 por falta de conexão).
      statement_timeout: STATEMENT_TIMEOUT_MS,
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
    // Atrás do Traefik do Coolify (app) ou do nginx do download (app web), o IP de quem pediu é o
    // primeiro endereço público do X-Forwarded-For lido da direita. Antes era `true`, que confia em
    // tudo e pega o primeiro da esquerda: quem mandasse esse cabeçalho escolhia o próprio IP e
    // escapava dos limites por IP (login do painel, cadastro, rotas sem conta). 0 usa o socket.
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? privateProxies : false,
    bodyLimit: 256 * 1024,
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
            serializers: {
              // Sem query string no log: o feed e o mapa mandam latitude e longitude de quem abre.
              req: (request: FastifyRequest) => ({
                method: request.method,
                url: request.url.split('?')[0],
                host: request.host,
                remoteAddress: request.ip,
              }),
            },
          },
  });

  await app.register(helmet, {
    // A API é JSON: CSP fica com o site. HSTS desde o domínio eguaadota.com.br (tudo HTTPS); o
    // navegador ignora o cabeçalho no sslip antigo (HTTP), então APK antigo não muda. Sem
    // includeSubDomains nem preload: cada subdomínio decide o seu e dá para voltar atrás.
    contentSecurityPolicy: false,
    hsts: { maxAge: 180 * 24 * 60 * 60, includeSubDomains: false, preload: false },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, {
    // WEB_ORIGIN e ADMIN_ORIGIN aceitam vários endereços separados por vírgula (domínio novo e o sslip antigo).
    origin:
      env.NODE_ENV === 'production'
        ? `${env.WEB_ORIGIN},${env.ADMIN_ORIGIN}`
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : true,
    credentials: true,
    // O padrão do @fastify/cors só libera GET, HEAD e POST: sem isto o navegador barra no
    // preflight o PATCH (status, perfil) e o DELETE (excluir) das páginas web e do painel.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, {
    global: true,
    // Flood guard per IP, before auth. High because carriers put many phones behind one IP.
    max: 600,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Muitas tentativas. Espere um minuto e tente de novo.',
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send(
          error.code ? { message: error.message, code: error.code } : { message: error.message },
        );
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
    captureServerError(error, {
      where: `${request.method} ${request.routeOptions.url ?? 'rota desconhecida'}`,
      requestId: request.id,
      userId: request.user?.id,
    });
    return reply.code(500).send({ message: 'Algo deu errado. Tente de novo.' });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('server-timing', `app;dur=${Math.round(reply.elapsedTime)}`);
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split('?')[0];
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'handled',
    );
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
