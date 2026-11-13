import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { reportError } from '../crash/reporter';
import type { MapPoint } from '../map/geo';

export interface DeviceFix extends MapPoint {
  accuracy: number;
}

const listeners = new Set<(fix: DeviceFix) => void>();
let current: DeviceFix | null = null;
let currentAt = 0;
let watchStarted = false;

const onWeb = Platform.OS === 'web';

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

function toFix(coords: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}): DeviceFix {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? 0,
  };
}

export function publishDeviceFix(fix: DeviceFix): void {
  current = fix;
  currentAt = Date.now();
  for (const listener of listeners) listener(fix);
}

/**
 * No navegador (app do iPhone) o expo-location pede `enableHighAccuracy: false` e
 * `maximumAge: Infinity` para Low e Balanced. O Safari então devolve a posição por Wi-Fi e
 * guarda a primeira para sempre: o ponto ficava 20 a 30 m fora e não mudava ao andar. Aqui o
 * navegador é chamado direto, sempre com o GPS e com uma idade máxima curta.
 */
function browserFix(maximumAge: number, timeout: number): Promise<DeviceFix | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toFix(position.coords)),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge, timeout },
    );
  });
}

async function nativeFix(accuracy: Location.Accuracy, wait: number): Promise<DeviceFix | null> {
  const position = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy, mayShowUserSettingsDialog: false }).catch(
      () => null,
    ),
    delay(wait),
  ]);
  return position ? toFix(position.coords) : null;
}

/**
 * Usa o último ponto que o aparelho já tem, depois um rápido e por fim o do GPS.
 * `onFix` roda assim que qualquer um chega, então um GPS lento não segura o mapa.
 * O último passo é o GPS (Accuracy.High) também no Android: o Balanced dava a quadra, não a
 * calçada, e o pino de quem cria um alerta não batia com o ponto azul do mapa.
 */
export async function readDeviceFix(onFix: (fix: DeviceFix) => void): Promise<boolean> {
  let found = false;
  const deliver = (fix: DeviceFix | null) => {
    if (!fix) return;
    found = true;
    publishDeviceFix(fix);
    onFix(fix);
  };

  if (onWeb) {
    if (current && Date.now() - currentAt < 30_000) deliver(current);
    deliver(await browserFix(60_000, 8_000));
    deliver(await browserFix(0, 15_000));
    return found;
  }

  const last = await Location.getLastKnownPositionAsync({
    maxAge: 15 * 60_000,
    requiredAccuracy: 5_000,
  }).catch(() => null);
  deliver(last ? toFix(last.coords) : null);

  deliver(await nativeFix(Location.Accuracy.Low, 8_000));
  deliver(await nativeFix(Location.Accuracy.High, 15_000));

  if (!found) {
    const older = await Location.getLastKnownPositionAsync().catch(() => null);
    deliver(older ? toFix(older.coords) : null);
  }
  return found;
}

/** Uma vigia só para o app inteiro. Não pede permissão. */
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
      if (onWeb) {
        navigator.geolocation.watchPosition(
          (position) => publishDeviceFix(toFix(position.coords)),
          (error) => {
            // Sem sinal por um tempo é normal; só a recusa encerra a vigia.
            if (error.code === error.PERMISSION_DENIED) watchStarted = false;
          },
          { enableHighAccuracy: true, maximumAge: 5_000 },
        );
        return;
      }
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15 },
        (position) => publishDeviceFix(toFix(position.coords)),
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
