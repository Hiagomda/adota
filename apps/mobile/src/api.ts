import Constants from 'expo-constants';
import {
  accountSchema,
  feedPageSchema,
  issueSummary,
  loginSchema,
  notificationSchema,
  notificationsPageSchema,
  parseList,
  postSchema,
  type Schema,
} from './apiSchemas';
import { appVersionHeaders } from './appVersion';
import { reportError } from './crash/reporter';
import type { Account, AppNotification, Post } from './types';

export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:3010';

/** Default per request. Uploads use a longer one. */
export const requestTimeoutMs = 15_000;

export type ApiErrorKind =
  /** The server answered with a non-2xx status. */
  | 'http'
  /** fetch itself failed: no connection, DNS, TLS, server unreachable. */
  | 'offline'
  /** No answer inside the timeout. */
  | 'timeout'
  /** The server answered, but not with the shape the app can render. */
  | 'invalid_response';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isNetworkError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.kind === 'offline' || error.kind === 'timeout');
}

/** Worth retrying automatically: the network dropped or the server itself failed. */
export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  return error instanceof ApiError && error.kind === 'http' && error.status >= 500;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * fetch with a deadline. Network failures surface as ApiError('offline'|'timeout') so callers can
 * tell "no internet" from a bug: a TypeError thrown by fetch is the network, one thrown by our
 * code is not, and only the former is mapped here.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = requestTimeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiError(0, 'A conexão demorou demais. Tente de novo.', 'timeout');
    }
    if (error instanceof TypeError) {
      throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.', 'offline');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface ApiInit<T> {
  method?: string;
  token?: string | null;
  body?: unknown;
  /** Validates the payload before it reaches a screen. */
  schema?: Schema<T>;
  timeoutMs?: number;
}

export async function api<T>(path: string, init: ApiInit<T> = {}): Promise<T> {
  const headers: Record<string, string> = { ...appVersionHeaders() };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const response = await fetchWithTimeout(
    `${apiUrl}${path}`,
    {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
    init.timeoutMs,
  );
  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // An HTML error page from the proxy, or a cut connection mid-body.
    if (!response.ok) throw new ApiError(response.status, messageForStatus(response.status));
    throw invalidResponse(path, response.status, 'body is not JSON');
  }
  if (!response.ok) {
    const message = (payload as { message?: unknown } | null)?.message;
    throw new ApiError(
      response.status,
      userFacingMessage(response.status, typeof message === 'string' ? message : undefined),
    );
  }
  if (!init.schema) return payload as T;
  const parsed = init.schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  throw invalidResponse(path, response.status, issueSummary(parsed.error));
}

function invalidResponse(path: string, status: number, detail: string): ApiError {
  const error = new ApiError(
    status,
    'O servidor respondeu de um jeito que o app não entendeu. Tente de novo mais tarde.',
    'invalid_response',
  );
  reportError(error, { source: 'handled', where: `api:${path}`, extra: { detail } });
  return error;
}

const libraryEnglish =
  /rate limit|too many requests|failed to fetch|network request failed|network error|something went wrong|internal server error|bad request|unauthorized|forbidden|not found|unexpected token|unexpected character|json parse|undefined is not|must be |is required|\binvalid\b|timeout|request failed|cannot |can't |unable to/i;

function userFacingMessage(status: number, raw: string | undefined): string {
  const message = raw?.trim() ?? '';
  if (status === 429 || libraryEnglish.test(message)) return messageForStatus(status);
  if (message.length > 0) return message;
  return messageForStatus(status);
}

function messageForStatus(status: number): string {
  if (status === 400) return 'Confira os dados e tente de novo.';
  if (status === 401) return 'Entre na sua conta para continuar.';
  if (status === 403) return 'Você não pode fazer isso.';
  if (status === 404) return 'Não encontrei o que você pediu.';
  if (status === 409) return 'Isso já foi registrado.';
  if (status === 429) return 'Muitas tentativas agora. Espere um pouco e tente de novo.';
  if (status >= 500) return 'O servidor está com problema. Tente de novo em instantes.';
  return 'Algo deu errado. Tente de novo.';
}

export function messageFrom(error: unknown): string {
  if (error instanceof ApiError && error.message.trim().length > 0) return error.message;
  return 'Algo deu errado. Tente de novo.';
}

export function loginWithEmail(email: string) {
  return api<{ token: string; user: Account }>('/auth/dev-login', {
    method: 'POST',
    body: { email },
    schema: loginSchema,
  });
}

export async function loadFeed(
  token: string | null,
  search = '',
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const page = await api(`/posts${search}`, { token, schema: feedPageSchema });
  return { posts: parseList(postSchema, page.posts, `/posts${search}`), nextCursor: page.nextCursor };
}

export function loadPost(id: string, token: string | null) {
  return api<Post>(`/posts/${id}`, { token, schema: postSchema });
}

export async function loadNotifications(token: string): Promise<{ notifications: AppNotification[] }> {
  const page = await api('/notifications', { token, schema: notificationsPageSchema });
  return { notifications: parseList(notificationSchema, page.notifications, '/notifications') };
}

export function loadMe(token: string) {
  return api<Account>('/me', { token, schema: accountSchema });
}
