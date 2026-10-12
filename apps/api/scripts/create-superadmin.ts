import { Pool } from 'pg';
import { loadEnv } from '../src/config.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

/**
 * Promotes an existing Firebase account to superadmin, or inserts one.
 * There is no public screen for this. Run it against the database directly.
 *
 * pnpm --filter @patinha/api create-superadmin -- --firebase-uid UID --name "Nome" --handle nome
 */
async function main(): Promise<void> {
  const firebaseUid = arg('firebase-uid');
  const name = arg('name');
  const handle = arg('handle');
  if (!firebaseUid) {
    throw new Error('Passe --firebase-uid. O script não cria senha nem lê segredo.');
  }
  const env = loadEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ id: string; role: string }>(
        `SELECT id, role FROM users WHERE firebase_uid = $1 AND deleted_at IS NULL`,
        [firebaseUid],
      );
      const found = existing.rows[0];
      if (!found) {
        if (!name || !handle || !/^[a-z0-9._]{3,24}$/.test(handle)) {
          throw new Error('Conta nova precisa de --name e --handle (letras minúsculas, 3 a 24).');
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (firebase_uid, name, handle, role, city)
           VALUES ($1, $2, $3, 'superadmin', 'Belém')
           RETURNING id`,
          [firebaseUid, name, handle],
        );
        const id = inserted.rows[0]?.id;
        if (!id) throw new Error('Não consegui criar o superadmin.');
        await client.query(
          `INSERT INTO audit_events (actor_id, action, target_type, target_id, after)
           VALUES ($1::uuid, 'staff.superadmin_bootstrap', 'user', $1::text, $2::jsonb)`,
          [id, JSON.stringify({ role: 'superadmin' })],
        );
        await client.query('COMMIT');
        console.log(`superadmin criado: ${id}`);
        return;
      }
      if (found.role === 'superadmin') {
        await client.query('ROLLBACK');
        console.log(`já é superadmin: ${found.id}`);
        return;
      }
      await client.query(`UPDATE users SET role = 'superadmin' WHERE id = $1`, [found.id]);
      await client.query(
        `INSERT INTO audit_events (actor_id, action, target_type, target_id, before, after)
         VALUES ($1::uuid, 'staff.superadmin_bootstrap', 'user', $1::text, $2::jsonb, $3::jsonb)`,
        [found.id, JSON.stringify({ role: found.role }), JSON.stringify({ role: 'superadmin' })],
      );
      await client.query('COMMIT');
      console.log(`superadmin promovido: ${found.id}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'falhou';
  console.error(message);
  process.exitCode = 1;
});
