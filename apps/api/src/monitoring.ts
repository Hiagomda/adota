import * as Sentry from '@sentry/node';
import type { Env } from './config.js';

// Erros do servidor no Sentry (mesma conta do app). Sem SENTRY_DSN nada é enviado e tudo segue
// só no log, como antes. Sem rastreamento de desempenho: só erros, para não pesar na VPS.

let enabled = false;

/** Cabeçalhos que nunca saem da VPS, mesmo que algum dia entrem num evento. */
const secretHeaders = new Set(['authorization', 'cookie', 'x-csrf-token']);

export function initMonitoring(env: Env): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        for (const name of Object.keys(headers)) {
          if (secretHeaders.has(name.toLowerCase())) delete headers[name];
        }
      }
      if (event.request) delete event.request.cookies;
      return event;
    },
  });
  enabled = true;
}

export type ErrorContext = {
  /** Onde aconteceu: rota (`POST /posts`) ou etapa (`notify:status`, `worker:rescue-alert`). */
  where: string;
  requestId?: string;
  userId?: string;
};

/** Manda um erro do servidor ao Sentry. Nunca lança: monitoramento não derruba pedido. */
export function captureServerError(error: unknown, context: ErrorContext): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('where', context.where);
    if (context.requestId) scope.setTag('request_id', context.requestId);
    // Só o id interno da conta, nunca e-mail ou nome.
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

/** Espera os eventos pendentes saírem antes de o processo terminar. */
export async function flushMonitoring(): Promise<void> {
  if (enabled) await Sentry.close(2000);
}
