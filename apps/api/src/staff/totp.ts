import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { HttpError } from '../http.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function totpCode(secret: Buffer, at = Date.now()): string {
  return hotp(secret, Math.floor(at / 1000 / 30));
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function totpMatches(secret: Buffer, code: string, at = Date.now()): boolean {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(at / 1000 / 30);
  return [counter - 1, counter, counter + 1].some((step) =>
    sameText(hotp(secret, step), normalized),
  );
}

export function encryptSecret(key: Buffer, plain: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(key: Buffer, stored: string): Buffer {
  const packed = Buffer.from(stored, 'base64');
  if (packed.length < 12 + 16 + 1)
    throw new HttpError(500, 'Não consegui ler a verificação em duas etapas.');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const enc = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function totpKeyFrom(raw: string | undefined): Buffer {
  if (!raw) {
    throw new HttpError(
      503,
      'O painel ainda não tem a chave de criptografia. Configure ADMIN_TOTP_KEY.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new HttpError(503, 'ADMIN_TOTP_KEY precisa ser 32 bytes em base64.');
  }
  return key;
}

export interface StaffTicket {
  sub: string;
  purpose: 'enroll' | 'totp';
  exp: number;
}

export function signStaffTicket(key: Buffer, ticket: StaffTicket): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function readStaffTicket(
  key: Buffer,
  token: string,
  purpose: StaffTicket['purpose'],
  now = Date.now(),
): StaffTicket {
  const [body, signature] = token.split('.');
  if (!body || !signature || token.split('.').length !== 2) {
    throw new HttpError(401, 'Essa etapa expirou. Entre de novo.');
  }
  const expected = createHmac('sha256', key).update(body).digest('base64url');
  if (!sameText(signature, expected))
    throw new HttpError(401, 'Essa etapa expirou. Entre de novo.');
  let parsed: Partial<StaffTicket>;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<StaffTicket>;
  } catch {
    throw new HttpError(401, 'Essa etapa expirou. Entre de novo.');
  }
  if (
    parsed.purpose !== purpose ||
    typeof parsed.sub !== 'string' ||
    typeof parsed.exp !== 'number' ||
    parsed.exp < now
  ) {
    throw new HttpError(401, 'Essa etapa expirou. Entre de novo.');
  }
  return { sub: parsed.sub, purpose, exp: parsed.exp };
}

export function otpauthUrl(handle: string, secret: Buffer): string {
  const label = encodeURIComponent(`Égua, adota:${handle}`);
  const issuer = encodeURIComponent('Égua, adota');
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
