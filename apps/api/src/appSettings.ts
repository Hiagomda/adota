import type { Pool, PoolClient } from 'pg';

/** Quanto tempo a API guarda a chave em memória antes de reler do banco. */
const CACHE_MS = 15_000;

let cached: { value: boolean; at: number } | null = null;

/**
 * Chave dos anúncios de parceiros, ligada e desligada pela equipe no painel. Começa desligada:
 * o Hiago só abre os anúncios quando o app tiver público.
 */
export async function partnersEnabled(pool: Pool): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const result = await pool.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = 'partners_enabled'`,
  );
  const value = result.rows[0]?.value === true;
  cached = { value, at: Date.now() };
  return value;
}

export async function setPartnersEnabled(
  client: Pool | PoolClient,
  enabled: boolean,
  actorId: string,
): Promise<boolean> {
  const before = await client.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = 'partners_enabled' FOR UPDATE`,
  );
  await client.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ('partners_enabled', $1::jsonb, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [JSON.stringify(enabled), actorId],
  );
  cached = null;
  return before.rows[0]?.value === true;
}

/** Os testes mudam a chave direto no banco. */
export function forgetSettingsCache(): void {
  cached = null;
}
