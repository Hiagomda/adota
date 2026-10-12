import {
  readCookie,
  readJson,
  rejectCrossOrigin,
  sessionCookie,
  upstream,
} from '../../../../lib/bff';

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const body = (await request.json()) as { code?: string };
  const ticket = readCookie(request.headers.get('cookie'), 'egua_admin_ticket');
  const upstreamResponse = await upstream('/admin/v1/session/totp', request, {
    method: 'POST',
    body: JSON.stringify({ ticket, code: body.code }),
  });
  const payload = await readJson(upstreamResponse);
  if (!upstreamResponse.ok || typeof payload.token !== 'string') {
    return Response.json(
      { message: payload.message ?? 'Código inválido.' },
      { status: upstreamResponse.status },
    );
  }
  const headers = new Headers();
  headers.append('set-cookie', sessionCookie(payload.token));
  headers.append('set-cookie', 'egua_admin_ticket=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  return Response.json({ ok: true }, { headers });
}
