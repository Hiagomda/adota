import {
  clearSessionCookies,
  readJson,
  rejectCrossOrigin,
  ticketCookie,
  upstream,
} from '../../../lib/bff';

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const body = (await request.json()) as { firebaseToken?: string; devToken?: string };
  const upstreamResponse = await upstream('/admin/v1/session', request, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstreamResponse);
  if (!upstreamResponse.ok) {
    return Response.json(
      { message: payload.message ?? 'Não consegui entrar.' },
      { status: upstreamResponse.status },
    );
  }
  const ticket = typeof payload.ticket === 'string' ? payload.ticket : '';
  return Response.json({ step: payload.step }, { headers: { 'set-cookie': ticketCookie(ticket) } });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  await upstream('/admin/v1/session/logout', request, { method: 'POST' });
  const headers = new Headers();
  for (const cookie of clearSessionCookies()) headers.append('set-cookie', cookie);
  return Response.json({ ok: true }, { headers });
}
