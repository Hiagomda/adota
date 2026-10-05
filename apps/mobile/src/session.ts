import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { loginWithEmail } from './api';
import type { Account } from './types';

const tokenKey = 'egua-token';
const flagKey = 'egua-flags';

interface Flags {
  onboarded: boolean;
  permissionsSeen: boolean;
}

interface SessionState extends Flags {
  ready: boolean;
  token: string | null;
  user: Account | null;
  hydrate: () => Promise<void>;
  finishWelcome: () => Promise<void>;
  finishPermissions: () => Promise<void>;
  login: (email: string) => Promise<void>;
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

async function readFlags(): Promise<Flags> {
  const raw =
    Platform.OS === 'web' ? localStorage.getItem(flagKey) : await SecureStore.getItemAsync(flagKey);
  if (!raw) return { onboarded: false, permissionsSeen: false };
  return JSON.parse(raw) as Flags;
}

async function writeFlags(flags: Flags): Promise<void> {
  const raw = JSON.stringify(flags);
  if (Platform.OS === 'web') localStorage.setItem(flagKey, raw);
  else await SecureStore.setItemAsync(flagKey, raw);
}

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  token: null,
  user: null,
  onboarded: false,
  permissionsSeen: false,
  hydrate: async () => {
    const flags = await readFlags();
    const token = await readToken();
    set({ ready: true, token, ...flags });
  },
  finishWelcome: async () => {
    const flags = { onboarded: true, permissionsSeen: get().permissionsSeen };
    await writeFlags(flags);
    set(flags);
  },
  finishPermissions: async () => {
    const flags = { onboarded: true, permissionsSeen: true };
    await writeFlags(flags);
    set(flags);
  },
  login: async (email) => {
    const result = await loginWithEmail(email);
    await writeToken(result.token);
    set({ token: result.token, user: result.user });
  },
  logout: async () => {
    await writeToken(null);
    set({ token: null, user: null });
  },
  setUser: (user) => set({ user }),
}));
