type Listener = () => void;

const listeners = new Set<Listener>();

/** Home tab asks the feed to jump to the top and reload. */
export function requestFeedRefresh(): void {
  for (const listener of listeners) listener();
}

export function onFeedRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
