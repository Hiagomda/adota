/** The path a rescued animal walks, in order. "Não encontrado" sits on the "A caminho" step. */
const rescuePath = [
  'open',
  'on_the_way',
  'rescued',
  'fostered',
  'for_adoption',
  'adopted',
] as const;

/** An adoption post starts with the animal already safe, so its path is only the end. */
const adoptionPath = ['for_adoption', 'adopted'] as const;

export interface Journey {
  steps: readonly string[];
  /** Index of the current step in `steps`. */
  current: number;
  /** True when the people who went did not find the animal. */
  notFound: boolean;
  /** The step after the current one, or null at the end. */
  next: string | null;
}

/** Where the animal is on its way off the street, or null for posts that do not walk that path. */
export function journeyOf(type: string, status: string): Journey | null {
  if (type !== 'rescue_alert' && type !== 'adoption') return null;
  const steps = type === 'adoption' ? adoptionPath : rescuePath;
  const notFound = status === 'not_found';
  const current = (steps as readonly string[]).indexOf(notFound ? 'on_the_way' : status);
  if (current < 0) return null;
  return { steps, current, notFound, next: steps[current + 1] ?? null };
}
