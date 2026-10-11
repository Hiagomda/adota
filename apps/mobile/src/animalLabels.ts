import type { Post } from './types';

export const speciesLabel: Record<string, string> = { dog: 'Cachorro', cat: 'Gato', other: 'Bichinho' };
export const sizeLabel: Record<string, string> = { small: 'Pequeno', medium: 'Médio', large: 'Grande' };
export const sexLabel: Record<string, string> = { male: 'Macho', female: 'Fêmea' };

/** The name typed at registration, or just the species when the animal has no name. */
export function animalHeadline(animal: Post['animal']): string {
  const name = animal.name?.trim();
  if (name) return name;
  return speciesLabel[animal.species] ?? 'Bichinho';
}

/** First part of "Marco, Belém": the neighborhood or street, without the city. */
export function placeOf(approxLabel: string): string {
  return approxLabel.split(',')[0]?.trim() || approxLabel;
}
