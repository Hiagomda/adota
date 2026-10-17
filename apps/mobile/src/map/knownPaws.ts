/** Teto de patas guardadas enquanto o mapa está aberto; as mais antigas saem primeiro. */
export const MAX_PAWS = 600;

/**
 * Junta o que a API devolveu para a área atual às patas que o mapa já tinha.
 * Trocar a lista inteira a cada arrasto (a API devolve até 100 por área) fazia patas na tela
 * sumirem e voltarem. Uma pata só sai quando a API a devolve fora do mapa (`keep` falso) ou
 * quando passa do teto. Devolve um Map novo; o anterior não muda.
 */
export function mergePaws<T extends { id: string }>(
  known: ReadonlyMap<string, T>,
  fetched: readonly T[],
  keep: (item: T) => boolean,
  max = MAX_PAWS,
): Map<string, T> {
  const next = new Map(known);
  for (const item of fetched) {
    next.delete(item.id);
    if (keep(item)) next.set(item.id, item);
  }
  for (const id of next.keys()) {
    if (next.size <= max) break;
    next.delete(id);
  }
  return next;
}
