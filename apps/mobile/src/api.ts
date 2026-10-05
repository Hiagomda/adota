import Constants from 'expo-constants';
import type { Account, AppNotification, Post } from './types';

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
  const payload = (await response.json()) as { message?: string };
  if (!response.ok)
    throw new ApiError(response.status, payload.message ?? 'Algo deu errado. Tente de novo.');
  return payload as T;
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
