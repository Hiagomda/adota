import { Camera } from 'expo-camera';
import { reportError } from './crash/reporter';
import { permissionOutcome } from './permissions';

export type CameraShot =
  | { uri: string }
  /** `blocked`: the system will not ask again; the screen offers the device settings. */
  | { error: string; blocked?: boolean }
  | { canceled: true };

let photoCount = 0;
let shooting = false;
let generation = 0;
let pendingResolve: ((shot: CameraShot) => void) | null = null;
let current: Promise<CameraShot> | null = null;
/** Shot that arrived before the create screen was mounted. */
let queued: CameraShot | null = null;
const waiters = new Set<(shot: CameraShot) => void>();
const openListeners = new Set<() => void>();

export type CameraSurface = { open: boolean; preview: boolean };

const CLOSED: CameraSurface = { open: false, preview: false };
let surface: CameraSurface = CLOSED;

export function setCreatePhotoCount(count: number) {
  photoCount = count;
}

function emitOpen() {
  for (const listener of openListeners) listener();
}

export function subscribeCreateCamera(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function isCreateCameraOpen() {
  return surface.open;
}

/** Stable snapshot for the camera overlay. `preview` is true only after the permission is granted. */
export function getCreateCameraSurface(): CameraSurface {
  return surface;
}

function setSurface(next: CameraSurface) {
  if (surface.open === next.open && surface.preview === next.preview) return;
  surface = next.open ? next : CLOSED;
  emitOpen();
}

/** Reads, without consuming, the shot captured before the create screen existed. */
export function peekInitialCreateShot(): CameraShot | null {
  return queued;
}

function deliver(result: CameraShot) {
  if (waiters.size === 0) {
    if (!('canceled' in result)) queued = result;
    return;
  }
  queued = null;
  for (const waiter of waiters) waiter(result);
}

export function finishCreateCamera(shot: CameraShot) {
  const resolve = pendingResolve;
  pendingResolve = null;
  if (resolve) {
    resolve(shot);
    return;
  }
  // Closed while the permission dialog was still up, before the preview existed.
  generation += 1;
  shooting = false;
  setSurface(CLOSED);
}

/**
 * Opens the camera on top of the current screen. Returns null when a shoot is already running,
 * the draft already has photos (unless `force`), or the limit of 5 was reached.
 * The overlay appears before the permission dialog, so the create form never flashes first.
 */
export function openCreateCamera(force = false): Promise<CameraShot> | null {
  if (shooting || photoCount >= 5) return null;
  if (!force && photoCount > 0) return null;
  shooting = true;
  const generationAtStart = ++generation;
  setSurface({ open: true, preview: false });
  const shot = (async (): Promise<CameraShot> => {
    let outcome: ReturnType<typeof permissionOutcome>;
    try {
      outcome = permissionOutcome(await Camera.requestCameraPermissionsAsync());
    } catch (error) {
      if (generationAtStart !== generation) return { canceled: true };
      // The permission module itself failed (activity gone, OS bug): tell the user and record it.
      reportError(error, { source: 'handled', where: 'camera:permission' });
      return { error: 'Não consegui pedir acesso à câmera. Tente de novo.' };
    }
    if (generationAtStart !== generation) return { canceled: true };
    if (outcome === 'blocked') {
      return {
        error: 'A câmera está bloqueada para o app. Libere nas configurações.',
        blocked: true,
      };
    }
    if (outcome === 'denied') return { error: 'Preciso da câmera para fotografar o animal.' };
    setSurface({ open: true, preview: true });
    return await new Promise<CameraShot>((resolve) => {
      pendingResolve = resolve;
    });
  })().finally(() => {
    if (generationAtStart !== generation) return;
    shooting = false;
    pendingResolve = null;
    setSurface(CLOSED);
  });
  current = shot;
  void shot.finally(() => {
    if (current === shot) current = null;
  });
  void shot.then(deliver);
  return shot;
}

export function watchCreateCamera(listener: (shot: CameraShot) => void) {
  waiters.add(listener);
  if (queued) {
    const shot = queued;
    queued = null;
    listener(shot);
  }
  return () => {
    waiters.delete(listener);
  };
}
