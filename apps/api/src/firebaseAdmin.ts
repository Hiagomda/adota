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

export function firebaseChecksRevocation(env: Env): boolean {
  return Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

export async function ensureFirebaseApp(env: Env): Promise<void> {
  if (!env.FIREBASE_PROJECT_ID) return;
  const admin = await import('firebase-admin');
  if (admin.apps.length > 0) return;
  const projectId = env.FIREBASE_PROJECT_ID;
  if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert({
        projectId,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }
  admin.initializeApp({ projectId, credential: publicCertificateCredential });
}
