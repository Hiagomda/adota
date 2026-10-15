/**
 * Resolves with the task's value, or with `fallback` once `ms` pass. The task keeps running and
 * its late result is dropped: opening the app never waits on a slow server.
 */
export function withDeadline<T, F>(task: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
