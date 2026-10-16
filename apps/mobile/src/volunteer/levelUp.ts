/**
 * Whether the level the person sees now is above the last one they saw. The first visit only
 * records the level: there is nothing to compare with yet.
 */
export function leveledUp(seenFloor: number | null, currentFloor: number): boolean {
  return seenFloor !== null && currentFloor > seenFloor;
}

/** Reads a stored floor back; anything that is not a whole number counts as never seen. */
export function parseSeenFloor(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
