import { readJson, rejectCrossOrigin, upstream } from '../../../../../lib/bff';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const { id } = await context.params;
  const body = await request.json();
  const upstreamResponse = await upstream(`/admin/v1/team/${id}/role`, request, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status });
}
