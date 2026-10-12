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
  /** Last settled view. The map loads paws for these edges. */
  loaded: MapBounds | null;
}

export const initialCameraState: CameraState = {
  centered: false,
  userMoved: false,
  follow: false,
  armed: false,
  user: null,
  loaded: null,
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
  | { type: 'region'; bounds: MapBounds; fromUser: boolean };

export interface CameraStep {
  state: CameraState;
  move: CameraMove | null;
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
      const next = event.fromUser
        ? { ...state, follow: false, armed: false, userMoved: true }
        : state;
      return { state: { ...next, loaded: event.bounds }, move: null };
    }
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
