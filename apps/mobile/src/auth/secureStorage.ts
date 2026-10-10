import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Under the 2048-byte Keychain limit, with room for multi-byte characters. */
const CHUNK = 1500;

function safeKey(key: string): string {
  return `fb.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function writeChunk(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function readChunk(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function dropChunk(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    sessionStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * Storage shape Firebase Auth expects. Values live in the Keychain/Keystore, split so a
 * refresh token larger than the platform limit still fits. Nothing here is written to AsyncStorage.
 */
export const secureAuthStorage = {
  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    const parts: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK) {
      parts.push(value.slice(index, index + CHUNK));
    }
    await writeChunk(`${base}.n`, String(parts.length));
    for (let index = 0; index < parts.length; index += 1) {
      await writeChunk(`${base}.${index}`, parts[index] ?? '');
    }
    for (let index = parts.length; index < parts.length + 4; index += 1) {
      await dropChunk(`${base}.${index}`).catch(() => undefined);
    }
  },

  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const countRaw = await readChunk(`${base}.n`);
    const count = Number(countRaw);
    if (!countRaw || !Number.isInteger(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await readChunk(`${base}.${index}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const countRaw = await readChunk(`${base}.n`);
    const count = Number(countRaw);
    await dropChunk(`${base}.n`).catch(() => undefined);
    const limit = Number.isInteger(count) && count > 0 ? count : 0;
    for (let index = 0; index < limit; index += 1) {
      await dropChunk(`${base}.${index}`).catch(() => undefined);
    }
  },
};
