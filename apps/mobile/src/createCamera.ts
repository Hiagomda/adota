import { Camera } from 'expo-camera';

export type CameraShot = { uri: string } | { error: string } | { canceled: true };

let photoCount = 0;
let shooting = false;
let cameraOpen = false;
let pendingResolve: ((shot: CameraShot) => void) | null = null;
let current: Promise<CameraShot> | null = null;
const waiters = new Set<(shot: CameraShot) => void>();
const openListeners = new Set<() => void>();

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
  return cameraOpen;
}

export function finishCreateCamera(shot: CameraShot) {
  const resolve = pendingResolve;
  pendingResolve = null;
  cameraOpen = false;
  emitOpen();
  resolve?.(shot);
}

export function openCreateCamera(force = false) {
  if (shooting || photoCount >= 5) return;
  if (!force && photoCount > 0) return;
  shooting = true;
  const permissionPromise = Camera.requestCameraPermissionsAsync();
  const shot = (async (): Promise<CameraShot> => {
    const permission = await permissionPromise;
    if (!permission.granted) return { error: 'Preciso da câmera para fotografar o animal.' };
    return await new Promise<CameraShot>((resolve) => {
      pendingResolve = resolve;
      cameraOpen = true;
      emitOpen();
    });
  })().finally(() => {
    shooting = false;
    pendingResolve = null;
    cameraOpen = false;
    emitOpen();
  });
  current = shot;
  void shot.finally(() => {
    if (current === shot) current = null;
  });
  for (const waiter of waiters) void shot.then(waiter);
}

export function watchCreateCamera(listener: (shot: CameraShot) => void) {
  waiters.add(listener);
  if (current) void current.then(listener);
  return () => {
    waiters.delete(listener);
  };
}
