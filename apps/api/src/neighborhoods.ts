import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

/** Steps that mean the animal left the street. */
const safeStatuses = ['rescued', 'fostered', 'for_adoption', 'adopted'];
const RANKING_DAYS = 30;
const RANKING_SIZE = 5;

/**
 * The neighborhood inside a place label. Labels come as "Rua X, 12 · Marco · Belém" from the
 * address lookup, or "Marco, Belém" when typed: the part before the city wins.
 */
export function neighborhoodFromLabel(label: string): string | null {
  const dotted = label
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (dotted.length >= 2) return dotted[dotted.length - 2] ?? null;
  const commas = label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (commas.length >= 2 && !/^-?\d/.test(commas[0] ?? '')) return commas[0] ?? null;
  return null;
}

/** Counts per neighborhood, biggest first, ties by name so the order is stable. */
export function rankNeighborhoods(
  labels: string[],
  size = RANKING_SIZE,
): { name: string; rescued: number }[] {
  const counts = new Map<string, { name: string; rescued: number }>();
  for (const label of labels) {
    const name = neighborhoodFromLabel(label);
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    const entry = counts.get(key) ?? { name, rescued: 0 };
    entry.rescued += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.rescued - a.rescued || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, size);
}

export function registerNeighborhoodRoutes(app: FastifyInstance, deps: { pool: Pool }): void {
  const { pool } = deps;

  // Public and anonymous: only neighborhood names and counts, never a point or a person.
  app.get('/stats/neighborhoods', async () => {
    const result = await pool.query<{ approx_label: string }>(
      `SELECT p.approx_label FROM posts p
       WHERE p.parent_post_id IS NULL AND p.hidden = false AND p.review_status = 'published'
         AND p.type IN ('rescue_alert', 'lost')
         AND p.status = ANY($1::text[])
         AND p.created_at > now() - make_interval(days => $2)`,
      [safeStatuses, RANKING_DAYS],
    );
    return {
      days: RANKING_DAYS,
      neighborhoods: rankNeighborhoods(result.rows.map((row) => row.approx_label)),
    };
  });
}
