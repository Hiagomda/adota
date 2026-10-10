import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import * as firebaseAuthModule from 'firebase/auth';
import { Platform } from 'react-native';
import { secureAuthStorage } from './secureStorage';

type Auth = firebaseAuthModule.Auth;

interface NativeAuth {
  getReactNativePersistence: (storage: typeof secureAuthStorage) => firebaseAuthModule.Persistence;
}

/**
 * Metro loads the React Native build of firebase/auth, which exports this helper.
 * The published TypeScript types only describe the browser build, so the extra export is named here.
 */
function nativePersistence(): firebaseAuthModule.Persistence {
  const native = firebaseAuthModule as unknown as NativeAuth;
  return native.getReactNativePersistence(secureAuthStorage);
}

function readOptions(): FirebaseOptions | null {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const messagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

function startAuth(app: FirebaseApp): Auth {
  // Web preview keeps the session in memory. Phones use the Keychain/Keystore via secureAuthStorage.
  // When Google sign-in is added on iOS, Sign in with Apple has to ship in the same build.
  const persistence =
    Platform.OS === 'web' ? firebaseAuthModule.inMemoryPersistence : nativePersistence();
  try {
    return firebaseAuthModule.initializeAuth(app, { persistence });
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : '';
    if (code === 'auth/already-initialized') return firebaseAuthModule.getAuth(app);
    throw error;
  }
}

let cached: Auth | null | undefined;

/** Null when the public Firebase config is missing. Callers show a setup message instead of crashing. */
export function firebaseAuth(): Auth | null {
  if (cached !== undefined) return cached;
  const options = readOptions();
  if (!options) {
    cached = null;
    return cached;
  }
  const app = getApps().length > 0 ? getApp() : initializeApp(options);
  cached = startAuth(app);
  return cached;
}
