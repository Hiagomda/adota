import { readJson, upstream } from '../../../lib/bff';

export async function GET(request: Request) {
  const cursor = new URL(request.url).searchParams.get('cursor');
  const path = cursor ? `/admin/v1/audit?cursor=${encodeURIComponent(cursor)}` : '/admin/v1/audit';
  const upstreamResponse = await upstream(path, request);
  const payload = await readJson(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status });
}
