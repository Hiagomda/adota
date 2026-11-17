import type { Credential } from 'firebase-admin/app';
import type { Env } from './config.js';

/**
 * Verifying an ID token only needs Google's public certificates and the project id.
 * firebase-admin still refuses to start unless some Credential object is present, and
 * this server has no Application Default Credentials. The real service account replaces
 * this when FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are set.
 */
const publicCertificateCredential: Credential = {
  getAccessToken() {
    return Promise.reject(new Error('Firebase service account is not configured'));
  },
};

/** Codes that always mean the token itself is no good: the person has to sign in again. */
const tokenRejections = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/** firebase-admin reports a failed download of Google's keys as an argument error too. */
const serverSideCause =
  /public key|fetch|network|socket|timeout|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i;

/**
 * True when verifyIdToken failed because of the token (expired, forged, revoked, malformed).
 * False for anything on our side or Google's side, which must not sign the person out.
 */
export function isTokenRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = error.code;
  if (typeof code !== 'string') return false;
  if (tokenRejections.has(code)) return true;
  if (code !== 'auth/argument-error') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return !serverSideCause.test(message);
}

const pemBlock = /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/;

/**
 * Chave da conta de serviço como o Coolify guardou: com `\n` escritos, aspas ou o resto do JSON
 * colado junto (aconteceu: ~80 caracteres depois do END). Fica só o bloco PEM. Nunca loga a chave.
 */
export function normalizePrivateKey(raw: string): string {
  const unescaped = raw.replace(/\\n/g, '\n');
  const block = pemBlock.exec(unescaped)?.[0];
  if (!block) throw new Error('FIREBASE_PRIVATE_KEY não tem um bloco BEGIN/END PRIVATE KEY');
  return `${block}\n`;
}

/** Chave pronta para uso, ou null se faltar ou estiver quebrada (aí o servidor só valida login). */
function serviceAccountKey(env: Env): string | null {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  try {
    return normalizePrivateKey(env.FIREBASE_PRIVATE_KEY);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', where: 'firebase:key', error: String(error) }));
    return null;
  }
}

export function firebaseChecksRevocation(env: Env): boolean {
  return serviceAccountKey(env) !== null;
}

export async function ensureFirebaseApp(env: Env): Promise<void> {
  if (!env.FIREBASE_PROJECT_ID) return;
  const admin = await import('firebase-admin');
  if (admin.apps.length > 0) return;
  const projectId = env.FIREBASE_PROJECT_ID;
  const privateKey = serviceAccountKey(env);
  if (env.FIREBASE_CLIENT_EMAIL && privateKey) {
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert({
        projectId,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    return;
  }
  admin.initializeApp({ projectId, credential: publicCertificateCredential });
}
