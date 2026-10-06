// Nominatim exige no máximo 1 pedido por segundo e um User-Agent que identifique o app.
// O navegador não deixa o cliente definir esse cabeçalho, então a API faz o pedido.

const userAgent = 'EguaAdota/1.0 (https://github.com/Hiagomda/adota)';
let lastRequestAt = 0;
let tail: Promise<void> = Promise.resolve();

export async function reverseAddress(latitude: number, longitude: number): Promise<string | null> {
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
    const body = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    return formatAddress(body.address, body.display_name);
  });
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
