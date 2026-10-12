import { readCookie, readJson, rejectCrossOrigin, upstream } from '../../../../lib/bff';

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ticket = readCookie(request.headers.get('cookie'), 'egua_admin_ticket');
  const upstreamResponse = await upstream('/admin/v1/totp/enroll', request, {
    method: 'POST',
    body: JSON.stringify({ ticket }),
  });
  const payload = await readJson(upstreamResponse);
  if (!upstreamResponse.ok) {
    return Response.json(
      { message: payload.message ?? 'Não consegui preparar o autenticador.' },
      { status: upstreamResponse.status },
    );
  }
  return Response.json({ otpauthUrl: payload.otpauthUrl, secret: payload.secret });
}
