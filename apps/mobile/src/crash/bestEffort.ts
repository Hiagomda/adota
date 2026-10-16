/**
 * `.catch` handler for work that may fail without harm to the person (haptics, splash,
 * cleanup of leftovers): writes one line to the log and moves on.
 */
export function logBestEffort(where: string): (error: unknown) => undefined {
  return (error: unknown) => {
    console.warn(`[best-effort:${where}]`, error instanceof Error ? error.message : String(error));
    return undefined;
  };
}
