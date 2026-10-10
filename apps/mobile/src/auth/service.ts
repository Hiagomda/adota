import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { reportError } from '../crash/reporter';
import { AuthError, authErrorFrom } from './errors';
import { firebaseAuth } from './firebaseAuth';
import { normalizeEmail } from './validation';

function requireAuth() {
  const auth = firebaseAuth();
  if (!auth) throw new AuthError('unavailable');
  return auth;
}

/** Restores the Firebase user and returns a fresh ID token, or null when nobody is signed in. */
export async function currentIdToken(forceRefresh = false): Promise<string | null> {
  const auth = firebaseAuth();
  if (!auth) return null;
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function signInWithEmail(email: string, password: string): Promise<string> {
  try {
    const credential = await signInWithEmailAndPassword(
      requireAuth(),
      normalizeEmail(email),
      password,
    );
    return await credential.user.getIdToken();
  } catch (error) {
    const authError = authErrorFrom(error);
    if (authError.code === 'unexpected') {
      reportError(authError, { source: 'handled', where: 'auth:sign-in' });
    }
    throw authError;
  }
}

/** Turns a Google ID token from the in-app account picker into a Firebase ID token. */
export async function signInWithGoogleIdToken(idToken: string): Promise<string> {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const signed = await signInWithCredential(requireAuth(), credential);
    return await signed.user.getIdToken();
  } catch (error) {
    const authError = authErrorFrom(error);
    if (authError.code === 'unexpected') {
      reportError(authError, { source: 'handled', where: 'auth:google' });
    }
    throw authError;
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<{ token: string; verificationSent: boolean }> {
  try {
    const credential = await createUserWithEmailAndPassword(
      requireAuth(),
      normalizeEmail(email),
      password,
    );
    await updateProfile(credential.user, { displayName: name.trim() });
    const token = await credential.user.getIdToken(true);
    let verificationSent = false;
    try {
      await sendEmailVerification(credential.user);
      verificationSent = true;
    } catch (error) {
      reportError(authErrorFrom(error), { source: 'handled', where: 'auth:verify-email' });
    }
    return { token, verificationSent };
  } catch (error) {
    const authError = authErrorFrom(error);
    if (authError.code === 'unexpected') {
      reportError(authError, { source: 'handled', where: 'auth:sign-up' });
    }
    throw authError;
  }
}

/**
 * Always resolves for a well-formed address. Firebase must not tell the screen whether the
 * e-mail exists; network and rate-limit failures still surface.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(requireAuth(), normalizeEmail(email));
  } catch (error) {
    const authError = authErrorFrom(error);
    if (authError.code === 'invalid-credentials') return;
    if (authError.code === 'unexpected') {
      reportError(authError, { source: 'handled', where: 'auth:reset' });
    }
    throw authError;
  }
}

export async function signOutAuth(): Promise<void> {
  const auth = firebaseAuth();
  if (!auth) return;
  await signOut(auth).catch((error: unknown) => {
    reportError(authErrorFrom(error), { source: 'handled', where: 'auth:sign-out' });
  });
}
