// Nominatim exige no máximo 1 pedido por segundo e um User-Agent que identifique o app.
// O navegador não deixa o cliente definir esse cabeçalho, então a API faz o pedido.

const userAgent = 'EguaAdota/1.0 (https://github.com/Hiagomda/adota)';
let lastRequestAt = 0;
let tail: Promise<void> = Promise.resolve();

interface ReverseBody {
  display_name?: string;
  address?: Record<string, string | undefined>;
}

/** One Nominatim lookup, queued so the app never sends more than one per second. */
function lookup(latitude: number, longitude: number): Promise<ReverseBody | null> {
  const run = tail.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('accept-language', 'pt-BR');
    const response = await fetch(url, {
      headers: { 'user-agent': userAgent, accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as ReverseBody;
  });
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function reverseAddress(latitude: number, longitude: number): Promise<string | null> {
  const body = await lookup(latitude, longitude);
  if (!body) return null;
  return formatAddress(body.address, body.display_name);
}

/** Neighborhood and city only, never the street: for places shown to everyone. */
export async function reverseNeighborhood(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const body = await lookup(latitude, longitude);
  return neighborhoodLine(body?.address);
}

export function neighborhoodLine(
  address: Record<string, string | undefined> | undefined,
): string | null {
  if (!address) return null;
  const neighborhood = address.suburb || address.neighbourhood || address.quarter;
  const city = address.city || address.town || address.village || address.municipality;
  const line = [neighborhood, city].filter(Boolean).join(', ');
  return line || null;
}

function formatAddress(
  address: Record<string, string | undefined> | undefined,
  displayName: string | undefined,
): string | null {
  if (!address) return displayName ?? null;
  const street = [address.road, address.house_number].filter(Boolean).join(', ');
  const neighborhood = address.suburb || address.neighbourhood || address.quarter;
  const city = address.city || address.town || address.village || address.municipality;
  const line = [street, neighborhood, city].filter(Boolean).join(' · ');
  return line || displayName || null;
}
