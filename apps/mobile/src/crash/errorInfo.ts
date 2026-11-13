import { formatAppVersion } from '../appVersion';

export interface ErrorInfo {
  name: string;
  message: string;
  stack: string | null;
}

/** Normalizes anything thrown (Error, string, object, null) into a plain description. */
export function describeError(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { name: 'Error', message: error, stack: null };
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : safeStringify(error);
    const name = typeof record.name === 'string' ? record.name : 'Error';
    const stack = typeof record.stack === 'string' ? record.stack : null;
    return { name, message, stack };
  }
  return { name: 'Error', message: String(error), stack: null };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Short code that identifies an error, stable for the same message and first stack frame.
 * It is what the person reads from the error screen when reporting a crash, e.g. "E-7F3A2C".
 */
export function errorCode(error: unknown): string {
  const info = describeError(error);
  const firstFrame = info.stack?.split('\n').find((line) => /\bat\b|@/.test(line)) ?? '';
  const input = `${info.name}|${info.message}|${firstFrame.trim()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `E-${hash.toString(16).toUpperCase().padStart(8, '0').slice(-6)}`;
}

/** Text copied from the error screen: enough for support to find the event in the crash reporter. */
export function errorReportText(error: unknown, eventId: string | null): string {
  const info = describeError(error);
  const lines = [
    `Égua, adota! ${formatAppVersion()}`,
    `Código: ${errorCode(error)}`,
    eventId ? `Evento: ${eventId}` : null,
    `${info.name}: ${info.message}`,
    info.stack ? info.stack.split('\n').slice(0, 8).join('\n') : null,
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}
