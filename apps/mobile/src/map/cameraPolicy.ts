/** [longitude, latitude], the order MapLibre cameras use. */
export type LngLat = [number, number];

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * O máximo que dá para afastar. Com 8,5 a pessoa puxava até ver o Pará inteiro. Desde a chegada
 * de Castanhal e Barcarena a área tem ~130 km de leste a oeste: 9 mostra a região toda num
 * celular deitado e quase toda num em pé, sem chegar ao estado inteiro. O `maxBounds` da câmera
 * (área + margem) segura o resto.
 */
export const MIN_MAP_ZOOM = 9;
/** Mais perto que isso a foto do satélite some e só sobra a rua; também evita pin "gigante". */
export const MAX_MAP_ZOOM = 18;
export const CITY_ZOOM = 12;
export const USER_ZOOM = 14;
export const PIN_ZOOM = 15;

export interface CameraState {
  /** The one allowed automatic center already happened, or the user took the camera first. */
  centered: boolean;
  /** The user touched the map. A late GPS fix must not pull the camera back. */
  userMoved: boolean;
  /** Last fix inside the service area. The puck uses this; the camera does not. */
  user: LngLat | null;
  /** Last settled view. The map loads paws for these edges. */
  loaded: MapBounds | null;
}

export const initialCameraState: CameraState = {
  centered: false,
  userMoved: false,
  user: null,
  loaded: null,
};

export type CameraMove =
  | {
      center: LngLat;
      zoom: number;
      reason: 'initial' | 'locate' | 'pin' | 'city';
    }
  | {
      /** Enquadra o retângulo inteiro (animais de uma cidade, resultado de busca). */
      bounds: MapBounds;
      reason: 'city';
    };

/** Para onde a pessoa pediu para ir: o centro de uma cidade ou um retângulo para enquadrar. */
export type CameraTarget = { center: LngLat; zoom: number } | { bounds: MapBounds };

export type CameraEvent =
  | { type: 'gps'; point: LngLat; inside: boolean }
  | { type: 'gpsUnavailable' }
  | { type: 'gesture' }
  | { type: 'locate' }
  | { type: 'pin'; point: LngLat }
  /** Toque da pessoa em "Voltar ao início" ou numa cidade da lista. */
  | { type: 'frame'; target: CameraTarget }
  | { type: 'dismissPin' }
  | { type: 'data' }
  | { type: 'region'; bounds: MapBounds; fromUser: boolean };

export interface CameraStep {
  state: CameraState;
  move: CameraMove | null;
}

/**
 * The only place that decides to move the camera.
 * It centers on the person once; after that only "Minha localização", "Voltar ao início", a
 * city picked from the list and a chosen pin move it.
 * There is no follow mode: it stayed on whenever Android did not report the gesture, and the
 * map kept pulling back to the person.
 */
export function reduceCamera(state: CameraState, event: CameraEvent): CameraStep {
  switch (event.type) {
    case 'gps': {
      if (!event.inside) return { state, move: null };
      const user = event.point;
      if (!state.centered) {
        if (state.userMoved) return { state: { ...state, centered: true, user }, move: null };
        return {
          state: { ...state, centered: true, user },
          move: { center: user, zoom: USER_ZOOM, reason: 'initial' },
        };
      }
      return { state: { ...state, user }, move: null };
    }
    case 'gpsUnavailable': {
      if (state.centered) return { state, move: null };
      return { state: { ...state, centered: true }, move: null };
    }
    case 'gesture':
      return { state: { ...state, userMoved: true }, move: null };
    case 'locate': {
      if (!state.user) return { state, move: null };
      return {
        state: { ...state, centered: true },
        move: { center: state.user, zoom: USER_ZOOM, reason: 'locate' },
      };
    }
    case 'pin':
      return {
        state: { ...state, centered: true },
        move: { center: event.point, zoom: PIN_ZOOM, reason: 'pin' },
      };
    case 'frame': {
      // É um pedido da pessoa, então vale mesmo depois de ela ter arrastado o mapa.
      const move: CameraMove =
        'bounds' in event.target
          ? { bounds: event.target.bounds, reason: 'city' }
          : { center: event.target.center, zoom: event.target.zoom, reason: 'city' };
      return { state: { ...state, centered: true }, move };
    }
    case 'dismissPin':
    case 'data':
      return { state, move: null };
    case 'region': {
      const next = event.fromUser ? { ...state, userMoved: true } : state;
      return { state: { ...next, loaded: event.bounds }, move: null };
    }
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
