import { useRef, useState } from 'react';

/** Ignores a second tap while the first request is still running. */
export function useSubmitLock() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<void>): Promise<void> {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await task();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return { pending, run };
}
