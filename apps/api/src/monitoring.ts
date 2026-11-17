import * as Sentry from '@sentry/node';
import type { Breadcrumb, ErrorEvent } from '@sentry/node';
import type { Env } from './config.js';

// Erros do servidor no Sentry (mesma conta do app). Sem SENTRY_DSN nada é enviado e tudo segue
// só no log, como antes. Sem rastreamento de desempenho: só erros, para não pesar na VPS.
// Nada pessoal sai daqui: sem IP, cookie, token, corpo de pedido, query string (tem latitude e
// longitude de quem abre o mapa), e-mail ou telefone dentro das mensagens de erro.

let enabled = false;

/** Cabeçalhos que podem ir para o Sentry. Todo o resto (authorization, cookie, IP…) fica na VPS. */
const allowedHeaders = new Set(['user-agent', 'content-type', 'content-length', 'x-request-id']);

/** Tira query string e fragmento: `/posts?latitude=-1.4&longitude=-48.4` vira `/posts`. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

const emailPattern = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const bearerPattern = /\b(Bearer|dev:)\s*[\w.:@+-]+/gi;
const jwtPattern = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
// Telefone com DDD (10 a 13 dígitos, com ou sem separador). Id numérico curto não casa.
const phonePattern = /(?<![\w-])(?:\+?\d{2}[\s-]?)?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}(?![\w-])/g;
// Par de coordenadas escrito no texto (mensagem do PostGIS, do geocode…).
const coordinatePattern = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

/** Limpa texto livre (mensagem de erro, valor de exceção) de dado pessoal e token. */
export function scrubText(text: string): string {
  return text
    .replace(jwtPattern, '[token]')
    .replace(bearerPattern, '$1 [token]')
    .replace(emailPattern, '[e-mail]')
    .replace(coordinatePattern, '[coordenadas]')
    .replace(phonePattern, '[telefone]');
}

/** Aplicado a todo evento antes de sair da VPS. Exportado para o teste. */
export function scrubEvent<E extends ErrorEvent>(event: E): E {
  const request = event.request;
  if (request) {
    if (request.url) request.url = scrubUrl(request.url);
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    delete request.env;
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (!allowedHeaders.has(name.toLowerCase())) delete request.headers[name];
      }
    }
  }
  // Só o id interno da conta; nunca e-mail, nome ou IP.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return event;
}

/** Trilha do que aconteceu antes do erro: sem console (o log tem dado do pedido) e sem query. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  if (crumb.message) crumb.message = scrubText(crumb.message);
  if (crumb.data) {
    const data = { ...crumb.data };
    for (const key of ['url', 'http.url', 'to', 'from']) {
      if (typeof data[key] === 'string') data[key] = scrubUrl(data[key] as string);
    }
    delete data['http.query'];
    delete data['http.fragment'];
    crumb.data = data;
  }
  return crumb;
}

export function initMonitoring(env: Env): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    initialScope: { tags: { service: 'api' } },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  enabled = true;
}

export function monitoringEnabled(): boolean {
  return enabled;
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
  try {
    Sentry.withScope((scope) => {
      scope.setTag('where', context.where);
      if (context.requestId) scope.setTag('request_id', context.requestId);
      // Só o id interno da conta, nunca e-mail ou nome.
      if (context.userId) scope.setUser({ id: context.userId });
      Sentry.captureException(error);
    });
  } catch (failure) {
    console.error(JSON.stringify({ level: 'error', where: 'monitoring', error: String(failure) }));
  }
}

/** Espera os eventos pendentes saírem antes de o processo terminar. */
export async function flushMonitoring(): Promise<void> {
  if (enabled) await Sentry.close(2000);
}
