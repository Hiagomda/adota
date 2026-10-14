import { useEffect, useState } from 'react';

export interface MapAim {
  postId: string;
  latitude: number;
  longitude: number;
  /** Changes on every request, so the same animal can be framed again. */
  token: number;
}

let current: MapAim | null = null;
let nextToken = 0;
const listeners = new Set<(aim: MapAim) => void>();

/**
 * The map tab does not reliably receive route params from a post screen.
 * This hands it the pin directly, then the post screen switches to the tab.
 */
export function requestMapFocus(input: {
  postId: string;
  latitude: number;
  longitude: number;
}): void {
  nextToken += 1;
  const aim: MapAim = { ...input, token: nextToken };
  current = aim;
  for (const listener of listeners) listener(aim);
}

export function useMapAim(): MapAim | null {
  const [aim, setAim] = useState(current);
  useEffect(() => {
    listeners.add(setAim);
    return () => {
      listeners.delete(setAim);
    };
  }, []);
  return aim;
}
