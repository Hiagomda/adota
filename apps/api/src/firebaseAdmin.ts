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
