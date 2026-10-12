import { clearSessionCookies, readJson, rejectCrossOrigin, upstream } from '../../../../lib/bff';

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const body = await request.json();
  const upstreamResponse = await upstream('/admin/v1/sessions/revoke', request, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstreamResponse);
  if (!upstreamResponse.ok) {
    return Response.json(payload, { status: upstreamResponse.status });
  }
  const headers = new Headers();
  for (const cookie of clearSessionCookies()) headers.append('set-cookie', cookie);
  return Response.json({ ok: true }, { headers });
}
