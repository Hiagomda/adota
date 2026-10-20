import type { Post } from '../types';

/** Raio em volta do ponto onde um resgate aberto provavelmente é o mesmo animal. */
const NEARBY_KM = 0.3;
/** Depois disso o animal pode ter ido embora; um aviso novo faz sentido. */
const RECENT_MS = 72 * 3_600_000;
const streetStatuses = new Set(['open', 'on_the_way', 'not_found']);

/**
 * A busca dos resgates perto do ponto. O ponto é arredondado (~100 m) para mexer o pino um
 * pouquinho não disparar uma busca nova a cada arrasto.
 */
export function duplicateSearch(point: { latitude: number; longitude: number }): string {
  const latitude = point.latitude.toFixed(3);
  const longitude = point.longitude.toFixed(3);
  return `?latitude=${latitude}&longitude=${longitude}&radiusKm=${NEARBY_KM}&type=rescue_alert&limit=10`;
}

/**
 * Resgates abertos e recentes perto do ponto, a mesma espécie primeiro. Não impede publicar:
 * só deixa a pessoa ver se alguém já avisou do mesmo animal.
 */
export function likelyDuplicates(
  posts: Pick<Post, 'id' | 'status' | 'createdAt' | 'animal'>[],
  species: string,
  now: Date = new Date(),
): Pick<Post, 'id' | 'status' | 'createdAt' | 'animal'>[] {
  return posts
    .filter((post) => {
      const created = Date.parse(post.createdAt);
      return (
        streetStatuses.has(post.status) &&
        !Number.isNaN(created) &&
        now.getTime() - created <= RECENT_MS
      );
    })
    .sort((a, b) => {
      const sameA = a.animal.species === species ? 0 : 1;
      const sameB = b.animal.species === species ? 0 : 1;
      if (sameA !== sameB) return sameA - sameB;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    })
    .slice(0, 3);
}
