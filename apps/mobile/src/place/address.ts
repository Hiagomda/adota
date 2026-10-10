import { useEffect, useState } from 'react';
import { api, isNetworkError } from '../api';
import { reportError } from '../crash/reporter';
import type { MapPoint } from '../map/geo';

// Espera o pino parar antes de pedir o endereço. A API ainda segura 1 pedido por segundo.
const debounceMs = 800;

export function useAddress(point: MapPoint | null) {
  const key = point ? `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}` : null;
  const [fetched, setFetched] = useState<{ key: string; address: string | null } | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (!point || !key) return;
    let active = true;
    const handle = setTimeout(() => {
      setLooking(true);
      void api<{ address: string | null }>(
        `/geocode/reverse?latitude=${point.latitude}&longitude=${point.longitude}`,
      )
        .then((result) => {
          if (active) setFetched({ key, address: result.address });
        })
        .catch((error: unknown) => {
          if (active) setFetched({ key, address: null });
          // Offline or a missing address is normal; anything else is a bug in the client or API.
          if (!isNetworkError(error)) {
            reportError(error, { source: 'handled', where: 'geocode:reverse' });
          }
        })
        .finally(() => {
          if (active) setLooking(false);
        });
    }, debounceMs);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [key, point]);

  const address = fetched?.key === key ? fetched.address : null;
  return { address, looking: looking || (key !== null && fetched?.key !== key) };
}

export function placeLabel(point: MapPoint, address: string | null): string {
  if (address) return address.slice(0, 120);
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}
