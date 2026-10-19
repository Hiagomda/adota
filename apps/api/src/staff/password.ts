import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** scrypt com custo de ~64 MB: lento o bastante para atrapalhar quem testa senhas em massa. */
const params = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const maxmem = 128 * params.N * params.r * 2;

export const MIN_PASSWORD_LENGTH = 12;

function derive(password: string, salt: Buffer, options: ScryptOptions, keylen: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, { ...options, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Formato guardado: `scrypt$N$r$p$sal$hash`, sal e hash em base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params, params.keylen);
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(
    password,
    Buffer.from(salt, 'base64url'),
    { N: Number(n), r: Number(r), p: Number(p) },
    expected.length,
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash de uma senha que ninguém sabe, para usuário inexistente gastar o mesmo tempo. */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(24).toString('base64url'));
  return decoy;
}
