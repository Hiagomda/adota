import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import type { MapPoint } from '../map/geo';

export type GpsStatus = 'loading' | 'ready' | 'denied' | 'disabled' | 'timeout' | 'weak';

export interface GpsFix extends MapPoint {
  accuracy: number;
}

const timeoutMs = 12_000;
const weakAccuracyM = 50;

export function useAnimalGps() {
  const [status, setStatus] = useState<GpsStatus>('loading');
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [message, setMessage] = useState(
    'Buscando sua localização para indicar onde o animal está.',
  );

  const read = useCallback(async () => {
    setStatus('loading');
    setMessage('Buscando sua localização para indicar onde o animal está.');
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setStatus('disabled');
        setMessage('O GPS está desligado. Ligue a localização ou escolha o ponto no mapa.');
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
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
      // Códigos do GeolocationPositionError: 1 negado, 2 sem sinal, 3 tempo esgotado.
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
      setStatus('disabled');
      setMessage('Não consegui ler o GPS. Escolha o ponto no mapa.');
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => void read(), 0);
    return () => clearTimeout(handle);
  }, [read]);

  return { status, fix, message, retry: read };
}
