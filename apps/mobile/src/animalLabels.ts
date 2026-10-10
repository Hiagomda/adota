import type { Post } from './types';

export const speciesLabel: Record<string, string> = { dog: 'Cachorro', cat: 'Gato', other: 'Bichinho' };
export const sizeLabel: Record<string, string> = { small: 'Pequeno', medium: 'Médio', large: 'Grande' };
export const sexLabel: Record<string, string> = { male: 'Macho', female: 'Fêmea' };

/** "Cachorro médio": the animals have no name in the data, so the card is titled by what they are. */
export function animalHeadline(animal: Post['animal']): string {
  const species = speciesLabel[animal.species] ?? 'Bichinho';
  const size = sizeLabel[animal.size];
  return size ? `${species} ${size.toLowerCase()}` : species;
}

/** First part of "Marco, Belém": the neighborhood or street, without the city. */
export function placeOf(approxLabel: string): string {
  return approxLabel.split(',')[0]?.trim() || approxLabel;
}
