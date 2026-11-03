/**
 * Registros feitos sem internet (avistamento e nota do diário): o formato guardado no celular e
 * as regras de reenvio. Sem import de React Native, para rodar no node:test. O armazenamento e o
 * envio ficam em recordQueue.ts.
 */

export type RecordKind = 'sighting' | 'diary';

export interface PendingRecord {
  /** Também é a chave de reenvio que vai para a API (clientKey): mandar de novo não duplica. */
  id: string;
  kind: RecordKind;
  postId: string;
  /** Token de quem escreveu, só para conferir a conta na hora de mandar (tokenForDraft). */
  token: string;
  /** Quando foi registrado no celular. */
  createdAt: string;
  attempts: number;
  /** Frase curta para a lista: "Avistamento em Nazaré", "Nota no diário". */
  label: string;
  body: Record<string, unknown>;
  /** Foto da nota do diário, enviada antes da nota. */
  photoUri?: string | null;
}

export interface FailedRecord extends PendingRecord {
  /** Por que o servidor recusou, em pt-BR, para a pessoa decidir. */
  reason: string;
  failedAt: string;
}

/** Falhas do servidor (5xx) tentam de novo até isso; depois o registro vai para "não enviados". */
export const MAX_SERVER_ATTEMPTS = 5;

export type FailureKind = 'offline' | 'session' | 'server' | 'rejected';

/** O que fazer depois de uma falha: guardar e tentar depois, ou mostrar que não foi. */
export function afterFailure(failure: FailureKind, attempts: number): 'keep' | 'retry' | 'give_up' {
  if (failure === 'offline' || failure === 'session') return 'keep';
  if (failure === 'server' && attempts + 1 < MAX_SERVER_ATTEMPTS) return 'retry';
  return 'give_up';
}

export function newRecordId(now: number = Date.now(), random: () => number = Math.random): string {
  return `rec-${now.toString(36)}-${Math.floor(random() * 2 ** 32).toString(36)}`;
}

function clock(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * A nota do diário guarda a hora real quando chega bem depois: "(anotado às 14:32, sem
 * internet)". Até 10 minutos de atraso não muda nada.
 */
export function stampOfflineNote(
  description: string,
  createdAt: string,
  now: Date = new Date(),
): string {
  const late = now.getTime() - Date.parse(createdAt);
  if (!(late > 10 * 60_000)) return description;
  return `${description}\n(anotado às ${clock(createdAt)}, sem internet)`;
}

/** "Guardado às 14:32": a linha de cada registro ainda não enviado. */
export function pendingLine(record: Pick<PendingRecord, 'label' | 'createdAt'>): string {
  return `${record.label} · guardado às ${clock(record.createdAt)}`;
}

/** Registros deste resgate, do mais antigo para o mais novo. */
export function recordsFor<T extends PendingRecord>(records: readonly T[], postId: string): T[] {
  return records
    .filter((record) => record.postId === postId)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}
