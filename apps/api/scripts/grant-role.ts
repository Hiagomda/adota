import { Pool } from 'pg';
import { loadEnv } from '../src/config.js';
import { roles, type Role } from '../src/authz.js';

/**
 * Sets a role directly in the database. There is no public screen for this.
 * GRANT_HANDLE=alguem GRANT_ROLE=admin pnpm --filter @patinha/api exec tsx scripts/grant-role.ts
 */
const handle = process.env.GRANT_HANDLE?.trim().toLowerCase();
const role = process.env.GRANT_ROLE?.trim();

function isRole(value: string | undefined): value is Role {
  return roles.some((item) => item === value);
}

if (!handle || !isRole(role)) {
  process.stderr.write(
    'Defina GRANT_HANDLE e GRANT_ROLE (user, protector, ngo, moderator, admin).\n',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: loadEnv().DATABASE_URL });
try {
  const updated = await pool.query<{ handle: string }>(
    `UPDATE users SET role = $2 WHERE handle = $1 AND deleted_at IS NULL RETURNING handle`,
    [handle, role],
  );
  if ((updated.rowCount ?? 0) === 0) {
    process.stderr.write('Nenhuma conta ativa com esse @.\n');
    process.exit(1);
  }
  process.stdout.write(`Papel atualizado para ${role}.\n`);
} finally {
  await pool.end();
}
