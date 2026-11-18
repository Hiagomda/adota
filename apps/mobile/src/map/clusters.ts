/**
 * Agrupamento de patas para o mapa do navegador, que desenha marcadores em HTML (o Android usa
 * o agrupamento nativo do MapLibre). Mesma ideia: perto demais na tela vira um grupo com o
 * número; a partir de `maxZoom` todo animal aparece solto.
 */
export interface ClusterInput {
  id: string;
  latitude: number;
  longitude: number;
}

export type ClusterItem<T extends ClusterInput> =
  | { kind: 'single'; item: T }
  | {
      kind: 'group';
      id: string;
      count: number;
      latitude: number;
      longitude: number;
      bounds: { west: number; south: number; east: number; north: number };
    };

const TILE = 512;

/** Posição em pixels (Web Mercator) no zoom dado. */
function project(latitude: number, longitude: number, zoom: number): [number, number] {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((latitude * Math.PI) / 180);
  const x = ((longitude + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return [x, y];
}

export function clusterPoints<T extends ClusterInput>(
  points: readonly T[],
  zoom: number,
  options: { radiusPx?: number; maxZoom?: number; keepSingle?: string | null } = {},
): ClusterItem<T>[] {
  const radius = options.radiusPx ?? 44;
  const maxZoom = options.maxZoom ?? 14;
  if (zoom > maxZoom) return points.map((item) => ({ kind: 'single', item }));
  // Ordem estável: o primeiro de cada célula vira o centro do grupo.
  const sorted = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const groups: { center: [number, number]; members: T[] }[] = [];
  for (const point of sorted) {
    if (point.id === options.keepSingle) {
      groups.push({ center: [Number.NaN, Number.NaN], members: [point] });
      continue;
    }
    const [x, y] = project(point.latitude, point.longitude, zoom);
    const near = groups.find(
      (group) =>
        group.members[0]?.id !== options.keepSingle &&
        Math.hypot(group.center[0] - x, group.center[1] - y) <= radius,
    );
    if (near) near.members.push(point);
    else groups.push({ center: [x, y], members: [point] });
  }
  return groups.map((group) => {
    const [first] = group.members;
    if (group.members.length === 1 && first) return { kind: 'single', item: first };
    const latitudes = group.members.map((member) => member.latitude);
    const longitudes = group.members.map((member) => member.longitude);
    return {
      kind: 'group',
      id: `group:${group.members.map((member) => member.id).join(',')}`,
      count: group.members.length,
      latitude: latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length,
      longitude: longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length,
      bounds: {
        west: Math.min(...longitudes),
        east: Math.max(...longitudes),
        south: Math.min(...latitudes),
        north: Math.max(...latitudes),
      },
    };
  });
}
