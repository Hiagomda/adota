import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { reportError } from '../crash/reporter';
import type { MapPoint } from '../map/geo';
import { openAppSettings, permissionOutcome } from '../permissions';

export type GpsStatus = 'loading' | 'ready' | 'denied' | 'blocked' | 'disabled' | 'timeout' | 'weak';

export interface GpsFix extends MapPoint {
  accuracy: number;
}

/** What the screen can offer the user to get out of the current state. */
export type GpsFixAction = { label: string; run: () => Promise<void> } | null;

const timeoutMs = 12_000;
const weakAccuracyM = 50;

const searching = 'Buscando sua localização para indicar onde o animal está.';

export function useAnimalGps() {
  const [status, setStatus] = useState<GpsStatus>('loading');
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [message, setMessage] = useState(searching);

  const read = useCallback(async () => {
    setStatus('loading');
    setMessage(searching);
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setStatus('disabled');
        setMessage('O GPS está desligado. Ligue a localização ou escolha o ponto no mapa.');
        return;
      }
      const outcome = permissionOutcome(await Location.requestForegroundPermissionsAsync());
      if (outcome === 'blocked') {
        setStatus('blocked');
        setMessage(
          'A localização está bloqueada para o app. Libere nas configurações ou mova o mapa até o animal.',
        );
        return;
      }
      if (outcome === 'denied') {
        setStatus('denied');
        setMessage('Permissão negada. Mova o mapa até o local do animal.');
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), timeoutMs);
        }),
      ]);
      const accuracy = position.coords.accuracy ?? 0;
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy,
      };
      setFix(next);
      if (!accuracy || accuracy > weakAccuracyM) {
        setStatus('weak');
        setMessage(
          `Sinal fraco${accuracy ? `, margem de ${Math.round(accuracy)} m` : ''}. Ajuste o ponto no mapa.`,
        );
        return;
      }
      setStatus('ready');
      setMessage(`GPS com margem de ${Math.round(accuracy)} m. Mova o mapa se o ponto não estiver exato.`);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? Number((error as { code: unknown }).code)
          : 0;
      const text = error instanceof Error ? error.message.toLowerCase() : '';
      // GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout.
      if (code === 1 || text.includes('denied') || text.includes('permission')) {
        setStatus('denied');
        setMessage('Permissão negada. Mova o mapa até o local do animal.');
        return;
      }
      if (code === 3 || text === 'timeout' || text.includes('timeout')) {
        setStatus('timeout');
        setMessage('O GPS demorou demais. Escolha o ponto no mapa.');
        return;
      }
      if (code === 2 || text.includes('unavailable') || text.includes('disabled')) {
        setStatus('disabled');
        setMessage('O GPS está desligado. Ligue a localização ou escolha o ponto no mapa.');
        return;
      }
      // Anything else is not one of the known GPS outcomes: record it so it can be understood.
      reportError(error, { source: 'handled', where: 'gps:read' });
      setStatus('disabled');
      setMessage('Não consegui ler o GPS. Escolha o ponto no mapa.');
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => void read(), 0);
    return () => clearTimeout(handle);
  }, [read]);

  const action: GpsFixAction =
    status === 'blocked'
      ? { label: 'Liberar nas configurações', run: openAppSettings }
      : status === 'disabled'
        ? { label: 'Ligar o GPS', run: () => enableLocationServices().then(read) }
        : null;

  return { status, fix, message, retry: read, action };
}

/** Android shows the system "turn on location" dialog; iOS only has the settings app. */
async function enableLocationServices(): Promise<void> {
  if (Platform.OS !== 'android') return openAppSettings();
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    // The user dismissed the system dialog; `read` runs next and reports "disabled" again.
  }
}
