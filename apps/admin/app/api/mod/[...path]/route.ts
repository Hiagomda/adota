import { readJson, rejectCrossOrigin, upstream } from '../../../../lib/bff';

type Context = { params: Promise<{ path: string[] }> };

const sections = new Set(['overview', 'reports', 'verifications', 'posts', 'users']);
const actions = new Set(['review', 'visibility', 'suspend']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Repassa só as rotas de moderação conhecidas, para o navegador não alcançar outra rota da API. */
function upstreamPath(segments: string[]): string | null {
  const [section, id, action, ...rest] = segments;
  if (!section || !sections.has(section) || rest.length > 0) return null;
  if (id !== undefined && !uuid.test(id)) return null;
  if (action !== undefined && !actions.has(action)) return null;
  return `/admin/v1/${segments.join('/')}`;
}

function notFound(): Response {
  return Response.json({ message: 'Essa tela não existe.' }, { status: 404 });
}

export async function GET(request: Request, context: Context) {
  const path = upstreamPath((await context.params).path);
  if (!path) return notFound();
  const search = new URL(request.url).search;
  const upstreamResponse = await upstream(`${path}${search}`, request);
  const payload = await readJson(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status });
}

export async function POST(request: Request, context: Context) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const path = upstreamPath((await context.params).path);
  if (!path) return notFound();
  const body = await request.json();
  const upstreamResponse = await upstream(path, request, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await readJson(upstreamResponse);
  return Response.json(payload, { status: upstreamResponse.status });
}
