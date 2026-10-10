export const mapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
export const belem: [number, number] = [-48.49, -1.45];

export const urgencyColor = {
  high: '#E23B3B',
  medium: '#F08A24',
  low: '#1F8F4E',
} as const;

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Whole Belém box, so paws load before the camera reports its own edges. */
export const belemBounds: MapBounds = {
  west: -48.62753,
  south: -1.59875,
  east: -48.08741,
  north: -0.9356,
};

// Círculo aproximado em metros, usado como margem do GPS em volta do pino.
export function accuracyPolygon(point: MapPoint, radiusM: number) {
  const steps = 64;
  const latRad = (point.latitude * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(latRad);
  const ring: [number, number][] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    ring.push([
      point.longitude + (Math.cos(angle) * radiusM) / metersPerDegLng,
      point.latitude + (Math.sin(angle) * radiusM) / metersPerDegLat,
    ]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}
