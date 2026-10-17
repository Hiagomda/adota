import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { Pool } from 'pg';
import { loadEnv } from '../src/config.js';
import { staffRoles, type StaffRole } from '../src/staff/policy.js';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../src/staff/password.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value;
}

/** Lê a senha sem mostrar no terminal. */
async function askPassword(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = new Promise<string>((resolve) => rl.question(question, resolve));
  muted = true;
  const value = await answer;
  rl.close();
  process.stdout.write('\n');
  return value;
}

/**
 * Cria ou troca o login (usuário e senha) de alguém da equipe no painel.
 * Sem --handle, cria uma conta só da equipe. Com --handle, usa a conta do app que já existe.
 * A senha vem de STAFF_PASSWORD ou é pedida no terminal, nunca por argumento.
 *
 * pnpm --filter @patinha/api staff:login -- --username hiago --name "Hiago" --role superadmin
 */
async function main(): Promise<void> {
  const username = arg('username')?.trim().toLowerCase();
  const handle = arg('handle')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const roleArg = arg('role') ?? 'superadmin';
  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error('Passe --username com 3 a 32 letras minúsculas, números, ponto, - ou _.');
  }
  if (!(staffRoles as readonly string[]).includes(roleArg)) {
    throw new Error(`--role precisa ser um destes: ${staffRoles.join(', ')}.`);
  }
  const role = roleArg as StaffRole;
  const password = process.env.STAFF_PASSWORD ?? (await askPassword('Senha: '));
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (!process.env.STAFF_PASSWORD && password !== (await askPassword('Repita a senha: '))) {
    throw new Error('As senhas não batem.');
  }
  const passwordHash = await hashPassword(password);

  const pool = new Pool({ connectionString: loadEnv().DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existingLogin = await client.query<{ user_id: string }>(
        `SELECT user_id FROM staff_passwords WHERE username = $1`,
        [username],
      );
      let userId = existingLogin.rows[0]?.user_id;
      if (!userId && handle) {
        const byHandle = await client.query<{ id: string }>(
          `SELECT id FROM users WHERE handle = $1 AND deleted_at IS NULL`,
          [handle],
        );
        userId = byHandle.rows[0]?.id;
        if (!userId) throw new Error(`Nenhuma conta ativa com o @${handle}.`);
      }
      if (!userId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (firebase_uid, name, handle, role, city)
           VALUES ($1, $2, $3, $4, 'Belém')
           RETURNING id`,
          [
            `staff:${username}`,
            name ?? username,
            `equipe.${username.replace(/-/g, '_')}`.slice(0, 24),
            role,
          ],
        );
        userId = inserted.rows[0]?.id;
        if (!userId) throw new Error('Não consegui criar a conta.');
      }
      const before = await client.query<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [
        userId,
      ]);
      await client.query(`UPDATE users SET role = $2, suspended = false WHERE id = $1`, [
        userId,
        role,
      ]);
      await client.query(
        `INSERT INTO staff_passwords (user_id, username, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, updated_at = now()`,
        [userId, username, passwordHash],
      );
      // Senha nova derruba as sessões abertas com a antiga.
      await client.query(
        `UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      await client.query(
        `INSERT INTO audit_events (actor_id, action, target_type, target_id, before, after)
         VALUES (NULL, 'staff.login_set', 'user', $1, $2::jsonb, $3::jsonb)`,
        [
          userId,
          JSON.stringify({ role: before.rows[0]?.role ?? null }),
          JSON.stringify({ role, username }),
        ],
      );
      await client.query('COMMIT');
      process.stdout.write(`Login "${username}" pronto, papel ${role}.\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'falhou'}\n`);
  process.exitCode = 1;
});
