// A versão web roda em HTTPS e o navegador barra foto e envio em http:// (conteúdo misto). O nginx
// da página de download repassa esses servidores por caminhos do próprio site, e as respostas da
// API têm os endereços trocados aqui antes de chegar às telas.

export type ProxyRoutes = readonly (readonly [from: string, to: string])[];

/** Lê `http://origem=/caminho,http://outra=/outro`. Entradas sem `=` são ignoradas. */
export function parseProxyRoutes(raw: string | undefined): ProxyRoutes {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .flatMap((entry) => {
      const at = entry.indexOf('=');
      if (at <= 0) return [];
      const from = entry.slice(0, at).trim().replace(/\/$/, '');
      const to = entry
        .slice(at + 1)
        .trim()
        .replace(/\/$/, '');
      return from && to ? [[from, to] as const] : [];
    });
}

function rewriteString(value: string, routes: ProxyRoutes): string {
  for (const [from, to] of routes) {
    if (value === from) return to;
    if (value.startsWith(`${from}/`) || value.startsWith(`${from}?`)) {
      return `${to}${value.slice(from.length)}`;
    }
  }
  return value;
}

/** Troca, em qualquer profundidade, os textos que começam por uma origem da lista. */
export function rewriteUrls(value: unknown, routes: ProxyRoutes): unknown {
  if (routes.length === 0) return value;
  if (typeof value === 'string') return rewriteString(value, routes);
  if (Array.isArray(value)) return value.map((item) => rewriteUrls(item, routes));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = rewriteUrls(item, routes);
    return out;
  }
  return value;
}
