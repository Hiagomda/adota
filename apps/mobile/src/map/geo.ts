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

export function normalizeBounds(bounds: MapBounds): MapBounds {
  return {
    west: Math.min(bounds.west, bounds.east),
    east: Math.max(bounds.west, bounds.east),
    south: Math.min(bounds.south, bounds.north),
    north: Math.max(bounds.south, bounds.north),
  };
}

/** True when the camera moved enough that the loaded paws no longer cover the view. */
export function boundsMoved(previous: MapBounds | null, next: MapBounds): boolean {
  if (!previous) return true;
  const span = Math.max(next.east - next.west, next.north - next.south, 0.0001);
  const slack = span * 0.2;
  return (
    Math.abs(previous.west - next.west) > slack ||
    Math.abs(previous.east - next.east) > slack ||
    Math.abs(previous.north - next.north) > slack ||
    Math.abs(previous.south - next.south) > slack
  );
}

/** Rejects an empty or world-sized box so a bad camera event cannot wipe the feed. */
export function usableMapBounds(bounds: MapBounds): boolean {
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;
  return width > 0.00005 && height > 0.00005 && width < 3 && height < 3;
}

/**
 * True when the camera is zoomed in and centered on the point.
 * The opening view of Belém is wide, so a pin that merely sits inside it does not count.
 */
export function cameraFramesPoint(bounds: MapBounds, point: MapPoint): boolean {
  const width = bounds.east - bounds.west;
  const height = bounds.north - bounds.south;
  // Zoom 12 over Belém is about 0.07° wide. A phone at the pin zoom is about 0.03°.
  if (!(width > 0) || !(height > 0) || width > 0.045 || height > 0.045) return false;
  const centerLng = (bounds.west + bounds.east) / 2;
  const centerLat = (bounds.south + bounds.north) / 2;
  return (
    Math.abs(centerLng - point.longitude) <= width * 0.35 &&
    Math.abs(centerLat - point.latitude) <= height * 0.35
  );
}

/** A small box around a pin, so "mostrar no mapa" loads that animal immediately. */
export function boundsAround(point: MapPoint, span = 0.03): MapBounds {
  return {
    west: point.longitude - span,
    east: point.longitude + span,
    south: point.latitude - span,
    north: point.latitude + span,
  };
}

/** Whole Belém box, so paws load before the camera reports its own edges. */
/** How the camera got to an area: a gesture of the person, or a move the app made. */
export interface BoundsOrigin {
  fromUser: boolean;
}

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
