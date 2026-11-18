import { coverageText, municipalities } from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

/** Mensagem de "fora da área" com os municípios atendidos hoje. */
export function outsideAreaMessage(): string {
  return `Por enquanto o Égua, adota! funciona em ${coverageText}.`;
}

/** Animais que aparecem no mapa: ainda na rua ou esperando adoção. */
const onMapStatuses = ['open', 'on_the_way', 'for_adoption'];

export function registerMunicipalityRoutes(app: FastifyInstance, deps: { pool: Pool }): void {
  const { pool } = deps;

  // Público: a lista de municípios atendidos, com o retângulo para a câmera e quantos animais
  // estão no mapa em cada um. Só contagens, nunca um ponto ou uma pessoa.
  app.get('/municipalities', async (_request, reply) => {
    const counts = await pool.query<{ code: string; animals: number }>(
      `SELECT p.municipality_code AS code, count(*)::int AS animals
       FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.parent_post_id IS NULL AND p.hidden = false AND p.review_status = 'published'
         AND u.deleted_at IS NULL AND u.suspended = false
         AND p.type IN ('rescue_alert', 'adoption')
         AND p.status = ANY($1::text[])
         AND p.municipality_code IS NOT NULL
       GROUP BY p.municipality_code`,
      [onMapStatuses],
    );
    const byCode = new Map(counts.rows.map((row) => [row.code, row.animals]));
    reply.header('Cache-Control', 'public, max-age=60');
    return {
      municipalities: municipalities.map((item) => ({
        code: item.code,
        slug: item.slug,
        name: item.name,
        uf: item.uf,
        seat: item.seat,
        zoom: item.zoom,
        bounds: item.bounds,
        animals: byCode.get(item.code) ?? 0,
      })),
    };
  });
}
