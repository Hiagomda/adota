import { readJson, upstream } from '../../../lib/bff';

export async function GET(request: Request) {
  const upstreamResponse = await upstream('/admin/v1/team', request);
  const payload = await readJson(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status });
}
