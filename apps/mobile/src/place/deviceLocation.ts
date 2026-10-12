import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { reportError } from '../crash/reporter';
import type { MapPoint } from '../map/geo';

export interface DeviceFix extends MapPoint {
  accuracy: number;
}

const listeners = new Set<(fix: DeviceFix) => void>();
let current: DeviceFix | null = null;
let watchStarted = false;

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

function toFix(position: Location.LocationObject): DeviceFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? 0,
  };
}

export function publishDeviceFix(fix: DeviceFix): void {
  current = fix;
  for (const listener of listeners) listener(fix);
}

/**
 * Uses the last point the phone already has, then a network fix, then a balanced one.
 * `onFix` runs as soon as any of those arrives, so a slow GPS chip does not block the map.
 */
export async function readDeviceFix(onFix: (fix: DeviceFix) => void): Promise<boolean> {
  let found = false;
  const deliver = (position: Location.LocationObject | null) => {
    if (!position) return;
    found = true;
    const fix = toFix(position);
    publishDeviceFix(fix);
    onFix(fix);
  };

  const last = await Location.getLastKnownPositionAsync({
    maxAge: 15 * 60_000,
    requiredAccuracy: 5_000,
  }).catch(() => null);
  deliver(last);

  const quick = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
      mayShowUserSettingsDialog: false,
    }).catch(() => null),
    delay(8_000),
  ]);
  deliver(quick);

  const fresh = await Promise.race([
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: false,
    }).catch(() => null),
    delay(12_000),
  ]);
  deliver(fresh);

  if (!found) {
    const older = await Location.getLastKnownPositionAsync().catch(() => null);
    deliver(older);
  }
  return found;
}

/** One watch for the whole app. Does not ask for permission. */
export function ensureDeviceWatch(): void {
  if (watchStarted) return;
  watchStarted = true;
  void (async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        watchStarted = false;
        return;
      }
      await readDeviceFix(() => undefined);
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 40 },
        (position) => publishDeviceFix(toFix(position)),
      );
    } catch (error) {
      watchStarted = false;
      reportError(error, { source: 'handled', where: 'device-location' });
    }
  })();
}

export function useViewerLocation(): DeviceFix | null {
  const [fix, setFix] = useState(current);
  useEffect(() => {
    const hear = (next: DeviceFix) => setFix(next);
    listeners.add(hear);
    ensureDeviceWatch();
    return () => {
      listeners.delete(hear);
    };
  }, []);
  return fix;
}
