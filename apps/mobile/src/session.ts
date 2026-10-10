import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { loginWithEmail } from './api';
import { reportError, setReporterUser } from './crash/reporter';
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
  hydrate: () => Promise<void>;
  finishPermissions: () => Promise<void>;
  login: (email: string) => Promise<void>;
  clearCupuPrompt: () => void;
  logout: () => Promise<void>;
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
  permissionsSeen: false,
  hydrate: async () => {
    const flags = await readOrDiscard(flagKey, readFlags, { permissionsSeen: false });
    const token = await readOrDiscard(tokenKey, readToken, null);
    set({ ready: true, token, ...flags });
  },
  finishPermissions: async () => {
    const flags = { permissionsSeen: true };
    await writeFlags(flags);
    set(flags);
  },
  login: async (email) => {
    const result = await loginWithEmail(email);
    await writeToken(result.token);
    setReporterUser({ id: result.user.id, handle: result.user.handle });
    set({ token: result.token, user: result.user, cupuPrompt: true });
  },
  clearCupuPrompt: () => set({ cupuPrompt: false }),
  logout: async () => {
    await writeToken(null);
    setReporterUser(null);
    set({ token: null, user: null });
  },
  setUser: (user) => {
    setReporterUser({ id: user.id, handle: user.handle });
    set({ user });
  },
}));
