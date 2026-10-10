import { useSyncExternalStore } from 'react';

interface FatalState {
  error: unknown;
  eventId: string | null;
}

let current: FatalState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Hands a fatal error caught outside React to the root layout, which shows the error screen. */
export function setFatalError(error: unknown, eventId: string | null): void {
  current = { error, eventId };
  emit();
}

export function clearFatalError(): void {
  if (current === null) return;
  current = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): FatalState | null {
  return current;
}

export function useFatalError(): FatalState | null {
  return useSyncExternalStore(subscribe, read, read);
}
