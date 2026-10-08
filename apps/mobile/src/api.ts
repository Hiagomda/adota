import Constants from 'expo-constants';
import type { Account, AppNotification, Post } from './types';

export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:3010';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const response = await fetch(`${apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  let payload: { message?: string } = {};
  try {
    payload = (await response.json()) as { message?: string };
  } catch {
    throw new ApiError(response.status, messageForStatus(response.status));
  }
  if (!response.ok) {
    throw new ApiError(response.status, userFacingMessage(response.status, payload.message));
  }
  return payload as T;
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
  });
}

export function loadFeed(token: string | null, search = '') {
  return api<{ posts: Post[]; nextCursor: string | null }>(`/posts${search}`, { token });
}

export function loadPost(id: string, token: string | null) {
  return api<Post>(`/posts/${id}`, { token });
}

export function loadNotifications(token: string) {
  return api<{ notifications: AppNotification[] }>('/notifications', { token });
}
