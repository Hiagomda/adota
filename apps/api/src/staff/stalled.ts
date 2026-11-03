import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { loadCentral } from '../central.js';
import type { Env } from '../config.js';
import { assertPermission } from './policy.js';
import { loadSession } from './routes.js';

/**
 * Fila de casos parados para o painel da equipe: os mesmos casos e motivos que a central mostra
 * com o filtro "Parados", mais quem publicou, para a equipe chamar a pessoa.
 */
export function registerStalledCaseRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool },
): void {
  const { env, pool } = deps;

  app.get('/admin/v1/stalled-cases', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const page = await loadCentral(pool, env, { stalled: 'true', limit: '100' }, null);
    const ids = page.cases.map((item) => item.id);
    const authors =
      ids.length === 0
        ? []
        : (
            await pool.query<{ id: string; name: string; handle: string; author_id: string }>(
              `SELECT p.id, u.id AS author_id, u.name, u.handle
               FROM posts p JOIN users u ON u.id = p.author_id
               WHERE p.id = ANY($1::uuid[])`,
              [ids],
            )
          ).rows;
    const byPost = new Map(authors.map((row) => [row.id, row]));
    return {
      serverTime: page.serverTime,
      total: page.summary.stalled,
      cases: page.cases.map((item) => {
        const author = byPost.get(item.id);
        return {
          ...item,
          author: author
            ? { id: author.author_id, name: author.name, handle: author.handle }
            : null,
        };
      }),
    };
  });
}
