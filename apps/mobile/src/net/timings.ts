export interface RequestSample {
  method: string;
  path: string;
  status: number;
  ms: number;
  bytes: number;
}

const samples: RequestSample[] = [];
const MAX_SAMPLES = 20;

/** Keeps the last few calls in memory. Nothing here is sent off the phone. */
export function recordRequest(sample: RequestSample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

export function recentRequests(): readonly RequestSample[] {
  return samples;
}

export function lastRequestLabel(): string {
  const last = samples.at(-1);
  if (!last) return 'ainda nenhuma';
  return `${last.method} ${last.path} · ${last.ms} ms · ${last.bytes} B`;
}

export function requestPath(input: string): string {
  try {
    return new URL(input).pathname;
  } catch {
    return input.split('?')[0] ?? input;
  }
}
