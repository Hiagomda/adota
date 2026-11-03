import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api, ApiError, isNetworkError, messageFrom } from '../api';
import { reportError } from '../crash/reporter';
import { tokenForDraft } from '../place/draftToken';
import { uploadProfilePhoto } from '../place/publish';
import {
  afterFailure,
  newRecordId,
  stampOfflineNote,
  type FailedRecord,
  type FailureKind,
  type PendingRecord,
  type RecordKind,
} from './pendingRecords';

/**
 * Fila de registros feitos sem internet: avistamentos e notas do diário. Fica no celular e vai
 * sozinha quando a conexão volta (o mesmo relógio da fila de resgates, em app/_layout.tsx). Cada
 * registro leva uma chave própria, então reenviar depois de um envio que caiu no meio não
 * duplica. O que o servidor recusar (o animal já saiu da rua, por exemplo) vai para "não
 * enviados", com o motivo, e a pessoa decide descartar.
 */
const pendingKey = 'egua-record-queue';
const failedKey = 'egua-record-failed';

const recordSchema = z.object({
  id: z.string(),
  kind: z.enum(['sighting', 'diary']),
  postId: z.string(),
  token: z.string(),
  createdAt: z.string(),
  attempts: z.number().int().nonnegative(),
  label: z.string(),
  body: z.record(z.unknown()),
  photoUri: z.string().nullable().optional(),
});
const failedSchema = recordSchema.extend({ reason: z.string(), failedAt: z.string() });

type Snapshot = { pending: PendingRecord[]; failed: FailedRecord[] };
let snapshot: Snapshot = { pending: [], failed: [] };
const listeners = new Set<(value: Snapshot) => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener(next);
}

async function readList<T>(key: string, schema: z.ZodType<T>): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed.flatMap((item) => {
      const result = schema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch (error) {
    reportError(error, { source: 'handled', where: `records:parse:${key}` });
    await AsyncStorage.removeItem(key);
    return [];
  }
}

async function writeList(key: string, items: readonly unknown[]): Promise<void> {
  if (items.length === 0) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, JSON.stringify(items));
}

async function load(): Promise<Snapshot> {
  const [pending, failed] = await Promise.all([
    readList(pendingKey, recordSchema),
    readList(failedKey, failedSchema),
  ]);
  const next = { pending, failed };
  publish(next);
  return next;
}

async function save(next: Snapshot): Promise<void> {
  await Promise.all([writeList(pendingKey, next.pending), writeList(failedKey, next.failed)]);
  publish(next);
}

/** Guarda um registro para mandar quando a internet voltar. */
export async function enqueueRecord(input: {
  kind: RecordKind;
  postId: string;
  token: string;
  label: string;
  body: Record<string, unknown>;
  photoUri?: string | null;
}): Promise<PendingRecord> {
  const current = await load();
  const record: PendingRecord = {
    ...input,
    id: newRecordId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await save({ ...current, pending: [...current.pending, record] });
  return record;
}

/** Tira um registro recusado da lista de "não enviados". */
export async function discardFailed(id: string): Promise<void> {
  const current = await load();
  await save({ ...current, failed: current.failed.filter((record) => record.id !== id) });
}

function failureOf(error: unknown): FailureKind {
  if (isNetworkError(error)) return 'offline';
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.status === 401) return 'session';
    if (error.status >= 500 || error.status === 429) return 'server';
  }
  return 'rejected';
}

async function send(record: PendingRecord, token: string): Promise<void> {
  if (record.kind === 'sighting') {
    await api(`/posts/${record.postId}/sightings`, {
      method: 'POST',
      token,
      body: { ...record.body, clientKey: record.id, seenAt: record.createdAt },
    });
    return;
  }
  let media: { url: string }[] = [];
  if (record.photoUri) {
    try {
      media = [{ url: await uploadProfilePhoto(token, record.photoUri) }];
    } catch (error) {
      if (isNetworkError(error)) throw error;
      // A foto sumiu do celular: a nota vai sem ela em vez de se perder.
      reportError(error, { source: 'handled', where: 'records:diary-photo' });
    }
  }
  const description = stampOfflineNote(String(record.body.description ?? ''), record.createdAt);
  await api('/posts', {
    method: 'POST',
    token,
    body: { ...record.body, description, media, clientKey: record.id },
  });
}

let inFlight: Promise<number> | null = null;

/** Manda o que estiver guardado. Uma rodada por vez, como a fila de resgates. */
export function flushRecords(sessionToken: string | null): Promise<number> {
  if (!inFlight) {
    inFlight = flush(sessionToken).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function flush(sessionToken: string | null): Promise<number> {
  const current = await load();
  if (current.pending.length === 0) return 0;
  const pending: PendingRecord[] = [];
  const failed = [...current.failed];
  let sent = 0;
  for (const record of current.pending) {
    const token = tokenForDraft(record.token, sessionToken);
    if (!token) {
      pending.push(record);
      continue;
    }
    try {
      await send(record, token);
      sent += 1;
    } catch (error) {
      const next = afterFailure(failureOf(error), record.attempts);
      if (next === 'keep') pending.push(record);
      else if (next === 'retry') pending.push({ ...record, attempts: record.attempts + 1 });
      else
        failed.push({ ...record, reason: messageFrom(error), failedAt: new Date().toISOString() });
    }
  }
  await save({ pending, failed });
  return sent;
}

/** O que ainda não foi enviado (e o que foi recusado), para a tela mostrar e atualizar sozinha. */
export function useRecordQueue(): Snapshot {
  const [value, setValue] = useState(snapshot);
  useEffect(() => {
    listeners.add(setValue);
    void load().catch(() => undefined);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
