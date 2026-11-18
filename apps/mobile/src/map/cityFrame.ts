import type { CameraTarget, LngLat, MapBounds } from './cameraPolicy.ts';
import { municipalities, municipalityAt, type Municipality } from './serviceArea.ts';

export const DEFAULT_CITY: Municipality = municipalities[0] as Municipality;

/** Menor lado do retângulo enquadrado (~2 km): um animal só não vira zoom de rua. */
const MIN_SPAN = 0.02;
/** Folga em volta dos animais, para nenhum ficar colado na borda da tela. */
const PADDING = 0.15;
/** Animal muito longe dos outros não estica o enquadramento da cidade inteira. */
const MAX_POINTS = 100;

/** O centro da sede no zoom de abertura da cidade. */
export function cityTarget(city: Municipality): { center: LngLat; zoom: number } {
  return { center: [city.seat.longitude, city.seat.latitude], zoom: city.zoom };
}

/**
 * O retângulo que a tela mostra ao abrir a cidade, antes de a câmera dizer as próprias bordas.
 * Um celular em pé mostra ~0,09° de largura no zoom 12; cada zoom a mais divide por dois.
 */
export function cityViewBounds(city: Municipality): MapBounds {
  const half = 0.045 * 2 ** (12 - city.zoom);
  return {
    west: city.seat.longitude - half,
    east: city.seat.longitude + half,
    south: city.seat.latitude - half * 1.6,
    north: city.seat.latitude + half * 1.6,
  };
}

/**
 * Enquadra os animais da cidade. Sem animal, abre a sede. Pontos fora da cidade (a lista vem da
 * busca da API, que já filtra) são ignorados por garantia.
 */
export function frameForAnimals(
  city: Municipality,
  points: readonly { latitude: number; longitude: number }[],
): CameraTarget {
  const inside = points
    .filter((point) => municipalityAt(point)?.code === city.code)
    .slice(0, MAX_POINTS);
  if (inside.length === 0) return cityTarget(city);
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const point of inside) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  const width = Math.max(east - west, MIN_SPAN);
  const height = Math.max(north - south, MIN_SPAN);
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  return {
    bounds: {
      west: centerLng - (width / 2) * (1 + PADDING * 2),
      east: centerLng + (width / 2) * (1 + PADDING * 2),
      south: centerLat - (height / 2) * (1 + PADDING * 2),
      north: centerLat + (height / 2) * (1 + PADDING * 2),
    },
  };
}

/** A cidade no meio da tela, para o seletor acompanhar o mapa. Fora da área, null. */
export function cityAtCenter(bounds: MapBounds): Municipality | null {
  return municipalityAt({
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  });
}
