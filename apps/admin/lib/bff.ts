const apiOrigin = process.env.ADMIN_API_URL ?? 'http://127.0.0.1:3010';

function secureFlag(): string {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ message: 'Não consegui confirmar esta ação.' }, { status: 403 });
  }
  return null;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function upstream(
  path: string,
  request: Request,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readCookie(request.headers.get('cookie'), 'egua_admin');
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  try {
    return await fetch(`${apiOrigin}${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    return Response.json({ message: 'A API não respondeu.' }, { status: 503 });
  }
}

export function sessionCookie(token: string): string {
  return `egua_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${8 * 60 * 60}${secureFlag()}`;
}

export function ticketCookie(ticket: string): string {
  return `egua_admin_ticket=${encodeURIComponent(ticket)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=300${secureFlag()}`;
}

export function clearSessionCookies(): string[] {
  const secure = secureFlag();
  return [
    `egua_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    `egua_admin_ticket=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  ];
}

export async function readJson(
  response: Response,
): Promise<{ message?: string } & Record<string, unknown>> {
  return (await response.json()) as { message?: string } & Record<string, unknown>;
}
