import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { isNetworkError, loadMe, setUnauthorizedHandler, ApiError } from './api';
import {
  currentIdToken,
  signInWithEmail,
  signInWithGoogleIdToken,
  signOutAuth,
  signUpWithEmail,
} from './auth/service';
import { signOutGoogle } from './auth/googleNative';
import { reportError, setReporterUser } from './crash/reporter';
import { queryClient } from './queryClient';
import type { Account } from './types';

const tokenKey = 'egua-token';
const flagKey = 'egua-flags';

interface Flags {
  permissionsSeen: boolean;
}

interface SessionState extends Flags {
  ready: boolean;
  token: string | null;
  user: Account | null;
  cupuPrompt: boolean;
  /** Set when the server rejects the saved session, so the welcome screen can explain it. */
  signedOutReason: string | null;
  hydrate: () => Promise<void>;
  finishPermissions: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  clearCupuPrompt: () => void;
  clearSignedOutReason: () => void;
  logout: (reason?: string) => Promise<void>;
  setUser: (user: Account) => void;
}

async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') return sessionStorage.getItem(tokenKey);
  return SecureStore.getItemAsync(tokenKey);
}

async function writeToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) sessionStorage.setItem(tokenKey, token);
    else sessionStorage.removeItem(tokenKey);
    return;
  }
  if (token) await SecureStore.setItemAsync(tokenKey, token);
  else await SecureStore.deleteItemAsync(tokenKey);
}

function parseFlags(raw: string | null): Flags {
  if (!raw) return { permissionsSeen: false };
  const parsed: unknown = JSON.parse(raw);
  const seen =
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { permissionsSeen?: unknown }).permissionsSeen === true;
  return { permissionsSeen: seen };
}

async function readFlags(): Promise<Flags> {
  const raw =
    Platform.OS === 'web' ? localStorage.getItem(flagKey) : await SecureStore.getItemAsync(flagKey);
  return parseFlags(raw);
}

/**
 * The secure store can refuse to decrypt after a backup restore or a keystore reset, and a stored
 * value can be corrupted. Either would reject `hydrate` and leave the app on the splash forever.
 * The broken entry is removed, the error is recorded and the app continues signed out.
 */
async function readOrDiscard<T>(key: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    reportError(error, { source: 'handled', where: `session:${key}` });
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key).catch(() => undefined);
    return fallback;
  }
}

async function writeFlags(flags: Flags): Promise<void> {
  const raw = JSON.stringify(flags);
  if (Platform.OS === 'web') localStorage.setItem(flagKey, raw);
  else await SecureStore.setItemAsync(flagKey, raw);
}

export const useSession = create<SessionState>((set) => ({
  ready: false,
  token: null,
  user: null,
  cupuPrompt: false,
  signedOutReason: null,
  permissionsSeen: false,
  hydrate: async () => {
    const flags = await readOrDiscard(flagKey, readFlags, { permissionsSeen: false });
    const stored = await readOrDiscard(tokenKey, readToken, null);
    let token = stored;
    let user: Account | null = null;
    try {
      const fresh = await currentIdToken();
      const candidate = fresh ?? stored;
      if (candidate) {
        user = await loadMe(candidate);
        token = candidate;
        if (fresh) await writeToken(fresh);
        setReporterUser({ id: user.id, handle: user.handle });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOutAuth();
        await writeToken(null);
        token = null;
        user = null;
      } else if (!isNetworkError(error)) {
        reportError(error, { source: 'handled', where: 'session:hydrate' });
      }
    }
    set({ ready: true, token, user, ...flags });
  },
  finishPermissions: async () => {
    const flags = { permissionsSeen: true };
    await writeFlags(flags);
    set(flags);
  },
  signIn: async (email, password) => {
    const token = await signInWithEmail(email, password);
    try {
      const user = await loadMe(token);
      await writeToken(token);
      setReporterUser({ id: user.id, handle: user.handle });
      set({ token, user, cupuPrompt: true, signedOutReason: null });
    } catch (error) {
      await signOutAuth();
      throw error;
    }
  },
  signInWithGoogle: async (idToken) => {
    const token = await signInWithGoogleIdToken(idToken);
    try {
      const user = await loadMe(token);
      await writeToken(token);
      setReporterUser({ id: user.id, handle: user.handle });
      set({ token, user, cupuPrompt: true, signedOutReason: null });
    } catch (error) {
      await signOutAuth();
      throw error;
    }
  },
  signUp: async (name, email, password) => {
    const created = await signUpWithEmail(name, email, password);
    try {
      const user = await loadMe(created.token);
      await writeToken(created.token);
      setReporterUser({ id: user.id, handle: user.handle });
      set({ token: created.token, user, cupuPrompt: true, signedOutReason: null });
      return created.verificationSent;
    } catch (error) {
      await signOutAuth();
      throw error;
    }
  },
  refresh: async () => {
    const next = await currentIdToken();
    if (!next) return;
    await writeToken(next);
    set({ token: next });
  },
  clearCupuPrompt: () => set({ cupuPrompt: false }),
  clearSignedOutReason: () => set({ signedOutReason: null }),
  logout: async (reason) => {
    await signOutGoogle();
    await signOutAuth();
    await writeToken(null);
    setReporterUser(null);
    queryClient.clear();
    set({ token: null, user: null, signedOutReason: reason ?? null });
  },
  setUser: (user) => {
    setReporterUser({ id: user.id, handle: user.handle });
    set({ user });
  },
}));

let refreshingSession = false;

setUnauthorizedHandler(() => {
  const state = useSession.getState();
  if (!state.ready || !state.token || refreshingSession) return;
  const failed = state.token;
  refreshingSession = true;
  void (async () => {
    try {
      const next = await currentIdToken(true);
      if (next && next !== failed) {
        await writeToken(next);
        useSession.setState({ token: next });
        return;
      }
      await useSession.getState().logout('Sua sessão expirou. Entre de novo para continuar.');
    } finally {
      refreshingSession = false;
    }
  })();
});
