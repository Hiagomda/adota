import type { Pool, QueryResult, QueryResultRow } from 'pg';

/**
 * Consulta com filtro por raio (ST_DWithin) sem laço aninhado.
 *
 * O Postgres estima uns 3 posts para qualquer raio em geography, mesmo quando o raio pega quase a
 * cidade inteira. Com essa estimativa ele junta posts e animais num laço aninhado que compara cada
 * post com cada animal: com 25 mil posts o feed por raio levava 55 s e prendia as conexões do banco.
 * Sem o laço aninhado e sem JIT (só nesta transação) a mesma consulta leva menos de 0,1 s.
 */
export async function queryNearby<Row extends QueryResultRow>(
  pool: Pool,
  sql: string,
  params: unknown[],
): Promise<QueryResult<Row>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL enable_nestloop = off');
    // O custo estimado do ST_DWithin passa do limite do JIT, que gastava ~0,6 s compilando a
    // consulta a cada pedido para economizar milissegundos.
    await client.query('SET LOCAL jit = off');
    const result = await client.query<Row>(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
