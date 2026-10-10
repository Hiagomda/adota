/** [longitude, latitude], the order MapLibre cameras use. */
export type LngLat = [number, number];

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const CITY_ZOOM = 12;
export const USER_ZOOM = 14;
export const PIN_ZOOM = 15;

export interface CameraState {
  /** The one allowed automatic center already happened, or the user took the camera first. */
  centered: boolean;
  /** The user dragged or pinched. A late GPS fix must not pull the camera back. */
  userMoved: boolean;
  /** Second tap on "Minha localização" is what turns this on. A gesture turns it off. */
  follow: boolean;
  /** First tap armed follow; the next tap enables it. */
  armed: boolean;
  /** Last fix inside the service area. The puck uses this; the camera does not. */
  user: LngLat | null;
  /** Bounds whose rescues are loaded. */
  loaded: MapBounds | null;
  /** User panned away from `loaded` and has not asked to search yet. */
  offer: MapBounds | null;
}

export const initialCameraState: CameraState = {
  centered: false,
  userMoved: false,
  follow: false,
  armed: false,
  user: null,
  loaded: null,
  offer: null,
};

export type CameraMove = {
  center: LngLat;
  zoom: number;
  reason: 'initial' | 'locate' | 'follow' | 'pin';
};

export type CameraEvent =
  | { type: 'gps'; point: LngLat; inside: boolean }
  | { type: 'gpsUnavailable' }
  | { type: 'gesture' }
  | { type: 'locate' }
  | { type: 'pin'; point: LngLat }
  | { type: 'dismissPin' }
  | { type: 'data' }
  | { type: 'region'; bounds: MapBounds; fromUser: boolean }
  | { type: 'acceptSearch' };

export interface CameraStep {
  state: CameraState;
  move: CameraMove | null;
}

/** True when the view moved far enough that the loaded rescues no longer cover it. */
export function boundsDiffer(previous: MapBounds, next: MapBounds): boolean {
  const span = Math.max(
    Math.abs(previous.east - previous.west),
    Math.abs(previous.north - previous.south),
    0.0001,
  );
  const slack = span * 0.12;
  return (
    Math.abs(previous.west - next.west) > slack ||
    Math.abs(previous.east - next.east) > slack ||
    Math.abs(previous.north - next.north) > slack ||
    Math.abs(previous.south - next.south) > slack
  );
}

/**
 * The only place that decides to move the camera.
 * GPS updates, list reloads and focus changes return `move: null` after the first center.
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
      if (state.follow) {
        return {
          state: { ...state, user },
          move: { center: user, zoom: USER_ZOOM, reason: 'follow' },
        };
      }
      return { state: { ...state, user }, move: null };
    }
    case 'gpsUnavailable': {
      if (state.centered) return { state, move: null };
      return { state: { ...state, centered: true }, move: null };
    }
    case 'gesture':
      return { state: { ...state, follow: false, armed: false, userMoved: true }, move: null };
    case 'locate': {
      if (!state.user) return { state, move: null };
      if (state.follow) {
        return { state: { ...state, follow: false, armed: false }, move: null };
      }
      if (state.armed) {
        return {
          state: { ...state, follow: true, armed: false },
          move: { center: state.user, zoom: USER_ZOOM, reason: 'follow' },
        };
      }
      return {
        state: { ...state, armed: true },
        move: { center: state.user, zoom: USER_ZOOM, reason: 'locate' },
      };
    }
    case 'pin':
      return {
        state: { ...state, follow: false, armed: false, centered: true },
        move: { center: event.point, zoom: PIN_ZOOM, reason: 'pin' },
      };
    case 'dismissPin':
    case 'data':
      return { state, move: null };
    case 'region': {
      if (!event.fromUser && state.loaded === null) {
        return { state: { ...state, loaded: event.bounds, offer: null }, move: null };
      }
      if (!event.fromUser) return { state, move: null };
      const next = { ...state, follow: false, armed: false, userMoved: true };
      if (state.loaded && boundsDiffer(state.loaded, event.bounds)) {
        return { state: { ...next, offer: event.bounds }, move: null };
      }
      if (!state.loaded)
        return { state: { ...next, loaded: event.bounds, offer: null }, move: null };
      return { state: next, move: null };
    }
    case 'acceptSearch': {
      if (!state.offer) return { state, move: null };
      return { state: { ...state, loaded: state.offer, offer: null }, move: null };
    }
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
