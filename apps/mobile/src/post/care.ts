/**
 * The care facts an adopter asks first, as chips. Kept free of React Native so it runs under
 * node:test. A fact nobody filled in shows nothing; a "no" shows as a neutral note.
 */

export interface AnimalCare {
  neutered?: boolean | null;
  vaccinated?: boolean | null;
  goodWithKids?: boolean | null;
  goodWithAnimals?: boolean | null;
}

export type CareKey = keyof AnimalCare;

export const careKeys: CareKey[] = ['neutered', 'vaccinated', 'goodWithKids', 'goodWithAnimals'];

/** The short question shown in the forms, where the chip means "yes". */
export const careQuestion: Record<CareKey, string> = {
  neutered: 'Castrado',
  vaccinated: 'Vacinado',
  goodWithKids: 'Convive com crianças',
  goodWithAnimals: 'Convive com outros bichos',
};

const careNo: Record<CareKey, string> = {
  neutered: 'Ainda não castrado',
  vaccinated: 'Vacinas pendentes',
  goodWithKids: 'Melhor sem crianças',
  goodWithAnimals: 'Melhor sem outros bichos',
};

export interface CareChip {
  key: CareKey;
  label: string;
  yes: boolean;
}

export function careChips(care: AnimalCare | null | undefined): CareChip[] {
  if (!care) return [];
  const chips: CareChip[] = [];
  for (const key of careKeys) {
    const value = care[key];
    if (value === true) chips.push({ key, label: careQuestion[key], yes: true });
    else if (value === false) chips.push({ key, label: careNo[key], yes: false });
  }
  return chips;
}

/** Age bands the forms and the adoption filter offer. Stored as the lower-case word. */
export const ageBands = [
  { value: 'filhote', label: 'Filhote' },
  { value: 'adulto', label: 'Adulto' },
  { value: 'idoso', label: 'Idoso' },
] as const;

export type AgeBand = (typeof ageBands)[number]['value'];

/** The band of a stored age text, or null when it is free text from an older post. */
export function ageBandOf(stored: string | null | undefined): AgeBand | null {
  const word = stored?.trim().toLowerCase() ?? '';
  return ageBands.find((band) => word.startsWith(band.value))?.value ?? null;
}
