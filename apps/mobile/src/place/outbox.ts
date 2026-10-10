import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import { ApiError } from '../api';
import { reportError } from '../crash/reporter';
import { alertDraftSchema, isOfflineError, publishAlert, type AlertDraft } from './publish';

const storageKey = 'egua-outbox';

/** Server-side failures (5xx) are retried this many times before the draft is given up. */
const maxServerAttempts = 5;

const storedDraftSchema = alertDraftSchema.extend({ attempts: z.number().int().nonnegative().default(0) });
type StoredDraft = z.infer<typeof storedDraftSchema>;

/**
 * Reads the queue. Entries that no longer match the draft shape (older app version, corrupted
 * storage) are dropped and reported instead of making every flush reject for the rest of time.
 */
async function readAll(): Promise<StoredDraft[]> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    reportError(error, { source: 'handled', where: 'outbox:parse' });
    await AsyncStorage.removeItem(storageKey);
    return [];
  }
  if (!Array.isArray(parsed)) {
    reportError(new Error('Outbox is not a list'), { source: 'handled', where: 'outbox:shape' });
    await AsyncStorage.removeItem(storageKey);
    return [];
  }
  const drafts: StoredDraft[] = [];
  let dropped = 0;
  for (const item of parsed) {
    const result = storedDraftSchema.safeParse(item);
    if (result.success) drafts.push(result.data);
    else dropped += 1;
  }
  if (dropped > 0) {
    reportError(new Error(`Dropped ${dropped} unreadable outbox drafts`), {
      source: 'handled',
      where: 'outbox:drafts',
    });
    await writeAll(drafts);
  }
  return drafts;
}

async function writeAll(drafts: StoredDraft[]): Promise<void> {
  if (drafts.length === 0) await AsyncStorage.removeItem(storageKey);
  else await AsyncStorage.setItem(storageKey, JSON.stringify(drafts));
}

/** Keeps the rescue on this device when there is no network and sends it later by itself. */
export async function enqueueAlert(draft: AlertDraft): Promise<void> {
  const drafts = await readAll();
  await writeAll([...drafts.filter((item) => item.id !== draft.id), { ...draft, attempts: 0 }]);
}

let inFlight: Promise<number> | null = null;

/**
 * Sends queued drafts. Only one flush runs at a time: the app calls this on a timer, and a slow
 * upload that outlived the interval used to be published twice.
 */
export function flushOutbox(): Promise<number> {
  if (!inFlight) {
    inFlight = flush().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function flush(): Promise<number> {
  const drafts = await readAll();
  if (drafts.length === 0) return 0;
  const pending: StoredDraft[] = [];
  let sent = 0;
  for (const draft of drafts) {
    try {
      await publishAlert(draft);
      sent += 1;
    } catch (error) {
      if (isOfflineError(error)) {
        // Still no network: keep it as is and try again next time.
        pending.push(draft);
        continue;
      }
      const serverFailure = error instanceof ApiError && error.kind === 'http' && error.status >= 500;
      if (serverFailure && draft.attempts + 1 < maxServerAttempts) {
        pending.push({ ...draft, attempts: draft.attempts + 1 });
        continue;
      }
      // Rejected by the API (4xx), the photo file is gone, or the server kept failing:
      // retrying would never succeed, so the draft is dropped and the reason recorded.
      reportError(error, {
        source: 'handled',
        where: 'outbox:publish',
        extra: { draftId: draft.id, attempts: draft.attempts, photos: draft.photos.length },
      });
    }
  }
  await writeAll(pending);
  return sent;
}
