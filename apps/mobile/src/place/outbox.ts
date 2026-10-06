import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '../api';
import { isOfflineError, publishAlert, type AlertDraft } from './publish';

const storageKey = 'egua-outbox';

async function readAll(): Promise<AlertDraft[]> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return [];
  return JSON.parse(raw) as AlertDraft[];
}

async function writeAll(drafts: AlertDraft[]): Promise<void> {
  if (drafts.length === 0) await AsyncStorage.removeItem(storageKey);
  else await AsyncStorage.setItem(storageKey, JSON.stringify(drafts));
}

// Guarda o chamado neste aparelho quando não há rede e tenta de novo sozinho.
export async function enqueueAlert(draft: AlertDraft): Promise<void> {
  const drafts = await readAll();
  await writeAll([...drafts.filter((item) => item.id !== draft.id), draft]);
}

export async function flushOutbox(): Promise<number> {
  const drafts = await readAll();
  if (drafts.length === 0) return 0;
  const pending: AlertDraft[] = [];
  let sent = 0;
  for (const draft of drafts) {
    try {
      await publishAlert(draft);
      sent += 1;
    } catch (error) {
      const rejected = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (!rejected || isOfflineError(error)) pending.push(draft);
    }
  }
  await writeAll(pending);
  return sent;
}
