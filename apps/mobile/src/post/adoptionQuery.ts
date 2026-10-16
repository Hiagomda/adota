import type { AgeBand, CareKey } from './care';

/** What the person picked on "Para adoção". Empty fields do not filter. */
export interface AdoptionFilters {
  species?: 'dog' | 'cat';
  size?: 'small' | 'medium' | 'large';
  age?: AgeBand;
  care: CareKey[];
  place: string;
}

export const noAdoptionFilters: AdoptionFilters = { care: [], place: '' };

/** Query string for GET /posts. The API ignores flags it does not know, so old servers list all. */
export function adoptionQuery(filters: AdoptionFilters, cursor?: string): string {
  const params = new URLSearchParams({ status: 'for_adoption', limit: '20' });
  if (filters.species) params.set('species', filters.species);
  if (filters.size) params.set('size', filters.size);
  if (filters.age) params.set('age', filters.age);
  for (const key of filters.care) params.set(key, 'true');
  const place = filters.place.trim();
  if (place.length >= 2) params.set('place', place);
  if (cursor) params.set('cursor', cursor);
  return `?${params.toString()}`;
}

export function activeFilterCount(filters: AdoptionFilters): number {
  return (
    (filters.species ? 1 : 0) +
    (filters.size ? 1 : 0) +
    (filters.age ? 1 : 0) +
    filters.care.length +
    (filters.place.trim().length >= 2 ? 1 : 0)
  );
}
