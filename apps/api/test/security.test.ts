import { describe, expect, it } from 'vitest';
import { isOwnerToken } from '../src/accounts.js';
import { buildApp } from '../src/app.js';
import {
  forgetRevocationCheck,
  markRevocationChecked,
  REVOCATION_CHECK_EVERY_MS,
  revocationCheckDue,
} from '../src/register.js';
import { requireRole, requireUser } from '../src/authz.js';
import { loadEnv, productionProblems, productionWarnings, type Env } from '../src/config.js';
import { clientIp, configureStaffProxy } from '../src/staff/routes.js';
import type { DatabaseClient, RedisClient } from '../src/health.js';
import { HttpError } from '../src/http.js';
import {
  firebaseChecksRevocation,
  isTokenRejection,
  normalizePrivateKey,
} from '../src/firebaseAdmin.js';
import { extensionKind, ownedMediaKey, sniffImage } from '../src/mediaPolicy.js';
import { assertHelpRequest, publicPixKey, publicPlace } from '../src/privacy.js';
import type { SessionUser } from '../src/session.js';
import { stripControls } from '../src/text.js';
import { updateMeSchema } from '@patinha/shared';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';

const env: Env = {
  NODE_ENV: 'test',
  PORT: 3010,
  DATABASE_URL: 'postgres://patinha:patinha@localhost:5435/patinha',
  REDIS_URL: 'redis://localhost:6380',
  authDevMode: false,
  TRUST_PROXY_HOPS: 1,
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'patinha',
  MINIO_SECRET_KEY: 'patinha-secret',
  MINIO_BUCKET: 'patinha-media',
  IMGPROXY_URL: 'http://localhost:8080',
  IMGPROXY_KEY: '',
  IMGPROXY_SALT: '',
  WEB_ORIGIN: 'http://localhost:3000',
  ADMIN_ORIGIN: 'http://localhost:3020',
};

function user(role: string, verified = false): SessionUser {
  return {
    id: userId,
    firebaseUid: 'firebase',
    name: 'Pessoa',
    handle: 'pessoa',
    avatarUrl: null,
    phone: '91999999999',
    whatsappOptIn: true,
    role,
    verified,
    suspended: false,
    city: 'Belém',
    alertRadiusKm: 10,
    notificationsEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  };
}

describe('authorization', () => {
  it('asks for a session and refuses the wrong role', () => {
    expect(() => requireUser(null)).toThrow(HttpError);
    try {
      requireUser(null);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(401);
    }
    expect(() => requireRole(user('user'), ['admin'])).toThrow(HttpError);
    try {
      requireRole(user('user'), ['admin']);
    } catch (error) {
      expect((error as HttpError).statusCode).toBe(403);
    }
    expect(requireRole(user('moderator'), ['moderator', 'admin']).role).toBe('moderator');
  });

  it('refuses a role field on the profile update', () => {
    const parsed = updateMeSchema.safeParse({ name: 'Ana', role: 'admin' });
    expect(parsed.success).toBe(false);
  });

  it('signs out only when Firebase rejects the token itself', () => {
    const fail = (code: string, message = '') => Object.assign(new Error(message), { code });
    expect(isTokenRejection(fail('auth/id-token-expired'))).toBe(true);
    expect(isTokenRejection(fail('auth/id-token-revoked'))).toBe(true);
    expect(
      isTokenRejection(fail('auth/argument-error', 'Firebase ID token has invalid signature.')),
    ).toBe(true);
    // Google's keys could not be downloaded: a server problem, the session stays.
    expect(
      isTokenRejection(fail('auth/argument-error', 'Error fetching public keys for Google certs')),
    ).toBe(false);
    expect(
      isTokenRejection(fail('auth/argument-error', 'getaddrinfo EAI_AGAIN googleapis.com')),
    ).toBe(false);
    expect(isTokenRejection(fail('auth/internal-error'))).toBe(false);
    expect(isTokenRejection(fail('ECONNREFUSED'))).toBe(false);
    expect(isTokenRejection(new Error('database down'))).toBe(false);
  });

  it('makes the owner admin only after Firebase verified the address', () => {
    const owners = { OWNER_EMAILS: 'dono@example.com, outra@example.com' };
    expect(isOwnerToken(owners, { email: 'Dono@Example.com', email_verified: true })).toBe(true);
    expect(isOwnerToken(owners, { email: 'outra@example.com', email_verified: true })).toBe(true);
    // Anyone can create an e-mail account with the owner's address before verifying it.
    expect(isOwnerToken(owners, { email: 'dono@example.com', email_verified: false })).toBe(false);
    expect(isOwnerToken(owners, { email: 'dono@example.com' })).toBe(false);
    expect(isOwnerToken(owners, { email: 'alguem@example.com', email_verified: true })).toBe(false);
    expect(isOwnerToken({}, { email: 'dono@example.com', email_verified: true })).toBe(false);
  });
});

describe('malicious input', () => {
  it('accepts only an image key minted for that account', () => {
    const own = `uploads/${userId}/${fileId}.jpg`;
    expect(ownedMediaKey(userId, own)).toBe(true);
    expect(extensionKind(own)).toBe('jpeg');
    expect(ownedMediaKey(userId, `uploads/${otherId}/${fileId}.jpg`)).toBe(false);
    expect(ownedMediaKey(userId, 'https://evil.example/shell.jpg')).toBe(false);
    expect(ownedMediaKey(userId, `uploads/${userId}/../../etc/passwd`)).toBe(false);
    expect(ownedMediaKey(userId, `uploads/${userId}/${fileId}.exe`)).toBe(false);
  });

  it('reads the file header instead of the extension', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe('jpeg');
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    );
    const webp = new Uint8Array(12);
    webp.set(Uint8Array.from([0x52, 0x49, 0x46, 0x46]), 0);
    webp.set(Uint8Array.from([0x57, 0x45, 0x42, 0x50]), 8);
    expect(sniffImage(webp)).toBe('webp');
    expect(sniffImage(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('drops control characters and hides the street and the pix key', () => {
    expect(stripControls('olá\u0000<script>')).toBe('olá<script>');
    expect(
      publicPlace(false, {
        accuracyM: 4,
        addressText: 'Rua X, 10',
        referencePoint: 'portão azul',
      }),
    ).toEqual({ accuracyM: null, addressText: null, referencePoint: null });
    expect(publicPixKey(false, 'golpe@pix')).toBeNull();
    expect(publicPixKey(true, 'ong@pix')).toBe('ong@pix');
  });

  it('blocks pix requests except from an admin', () => {
    expect(() =>
      assertHelpRequest(user('user'), { type: 'rescue_alert', helpRequest: { kind: 'food' } }),
    ).toThrow(HttpError);
    expect(() =>
      assertHelpRequest(user('ngo', true), { type: 'help_request', helpRequest: { kind: 'food' } }),
    ).toThrow(HttpError);
    expect(() =>
      assertHelpRequest(user('admin'), { type: 'help_request', helpRequest: { kind: 'food' } }),
    ).not.toThrow();
  });
});

describe('http hardening', () => {
  it('sends nosniff and refuses a huge body', async () => {
    const database: DatabaseClient = {
      query: async () => ({ rows: [{ ok: 1 }] }),
      end: async () => {},
    };
    const redis: RedisClient = {
      ping: async () => 'PONG',
      disconnect: () => {},
    };
    const app = await buildApp({ env, database, redis });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    const huge = await app.inject({
      method: 'POST',
      url: '/health',
      headers: { 'content-type': 'application/json' },
      payload: 'a'.repeat(300_000),
    });
    expect(huge.statusCode).toBe(413);
    await app.close();
  });

  it('takes the client IP from the proxies of the VPS, not from a forged X-Forwarded-For', async () => {
    const database: DatabaseClient = { query: async () => ({}), end: async () => {} };
    const redis: RedisClient = { ping: async () => 'PONG', disconnect: () => {} };
    const app = await buildApp({ env, database, redis });
    app.get('/ip-de-teste', async (request) => ({ ip: request.ip }));
    const ipFor = async (forwarded: string) =>
      (
        await app.inject({
          method: 'GET',
          url: '/ip-de-teste',
          headers: { 'x-forwarded-for': forwarded },
        })
      ).json().ip;
    // Traefik acrescenta o IP real; o que a pessoa mandou fica à esquerda e é ignorado.
    expect(await ipFor('6.6.6.6, 200.1.2.3')).toBe('200.1.2.3');
    // App web: Traefik e depois o nginx do download, os dois na rede interna do Docker.
    expect(await ipFor('6.6.6.6, 200.1.2.3, 172.18.0.5')).toBe('200.1.2.3');
    await app.close();
  });

  it('checks token revocation only when a service account is configured', () => {
    expect(firebaseChecksRevocation(env)).toBe(false);
    expect(
      firebaseChecksRevocation({
        ...env,
        FIREBASE_PROJECT_ID: 'egua-adota',
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-fbsvc@egua-adota.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n',
      }),
    ).toBe(true);
    // Chave quebrada: segue só validando login, sem derrubar nada.
    expect(
      firebaseChecksRevocation({
        ...env,
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-fbsvc@egua-adota.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: 'key',
      }),
    ).toBe(false);
  });

  it('a chave do Firebase fica só com o bloco PEM, sem o que foi colado a mais', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIEabc\ndef==\n-----END PRIVATE KEY-----';
    // Como veio do Coolify: \n escritos e o começo do JSON colado depois do END.
    const colado =
      pem.replace(/\n/g, '\\n') +
      '\\n",\\n  "client_email": "x@egua-adota.iam.gserviceaccount.com",';
    expect(normalizePrivateKey(colado)).toBe(`${pem}\n`);
    expect(normalizePrivateKey(`"${pem}"`)).toBe(`${pem}\n`);
    expect(() => normalizePrivateKey('qualquer coisa')).toThrow(/BEGIN\/END/);
  });

  it('refuses to start in production with development settings', () => {
    expect(productionProblems(env)).toEqual([]);
    expect(productionProblems({ ...env, NODE_ENV: 'production', authDevMode: true })).toEqual(
      expect.arrayContaining([
        'AUTH_DEV_MODE precisa ser false',
        'FIREBASE_PROJECT_ID está vazio',
        'DATABASE_URL é o padrão local',
        'MINIO_SECRET_KEY é o padrão local',
        'IMGPROXY_KEY e IMGPROXY_SALT vazios',
      ]),
    );
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/insegura/);
    expect(
      productionProblems({
        ...env,
        NODE_ENV: 'production',
        FIREBASE_PROJECT_ID: 'egua-adota',
        DATABASE_URL: 'postgres://patinha:forte@postgres:5432/patinha',
        MINIO_SECRET_KEY: 'segredo-forte',
        IMGPROXY_KEY: 'aa',
        IMGPROXY_SALT: 'bb',
      }),
    ).toEqual([]);
  });
});

describe('IP de quem está no painel', () => {
  const secret = 'segredo-de-teste-com-mais-de-32-caracteres';
  const request = (headers: Record<string, string>) =>
    ({ ip: '10.0.0.5', headers }) as unknown as Parameters<typeof clientIp>[0];

  it('sem segredo configurado ignora o cabeçalho de IP', () => {
    configureStaffProxy(undefined);
    expect(clientIp(request({ 'x-egua-client-ip': '200.1.2.3' }))).toBe('10.0.0.5');
  });

  it('com o segredo certo usa o IP repassado pelo painel', () => {
    configureStaffProxy(secret);
    expect(
      clientIp(request({ 'x-egua-proxy-secret': secret, 'x-egua-client-ip': '200.1.2.3' })),
    ).toBe('200.1.2.3');
  });

  it('segredo errado ou IP inválido: vale o IP da conexão', () => {
    configureStaffProxy(secret);
    expect(
      clientIp(
        request({
          'x-egua-proxy-secret': 'x'.repeat(secret.length),
          'x-egua-client-ip': '200.1.2.3',
        }),
      ),
    ).toBe('10.0.0.5');
    expect(clientIp(request({ 'x-egua-client-ip': '200.1.2.3' }))).toBe('10.0.0.5');
    expect(
      clientIp(request({ 'x-egua-proxy-secret': secret, 'x-egua-client-ip': 'não é ip' })),
    ).toBe('10.0.0.5');
    configureStaffProxy(undefined);
  });

  it('recusa segredo curto', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', STAFF_PROXY_SECRET: 'curto' })).toThrow();
  });
});

describe('avisos de configuração em produção', () => {
  it('avisa push e Sentry desligados sem impedir a subida', () => {
    expect(productionWarnings({ ...env, NODE_ENV: 'production' })).toHaveLength(2);
    expect(productionWarnings(env)).toEqual([]);
  });
});

describe('conferência de conta revogada no Firebase', () => {
  it('confere no Google no máximo a cada 10 min por conta, e de novo depois de excluir', () => {
    const uid = 'uid-teste-revogacao';
    const start = 1_000_000;
    expect(revocationCheckDue(uid, start)).toBe(true);
    markRevocationChecked(uid, start);
    expect(revocationCheckDue(uid, start + REVOCATION_CHECK_EVERY_MS - 1)).toBe(false);
    expect(revocationCheckDue(uid, start + REVOCATION_CHECK_EVERY_MS)).toBe(true);
    markRevocationChecked(uid, start);
    forgetRevocationCheck(uid);
    expect(revocationCheckDue(uid, start + 1)).toBe(true);
  });
});
