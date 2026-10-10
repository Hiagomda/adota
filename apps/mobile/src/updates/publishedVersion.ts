export type PublishedNativeApp = {
  version: string;
  androidVersionCode: number | null;
  notes: string[];
};

export function parsePublishedNativeApp(value: unknown): PublishedNativeApp | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || record.version.trim() === '') return null;
  const code = record.androidVersionCode;
  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .slice(0, 8)
    : [];
  return {
    version: record.version.trim(),
    androidVersionCode: typeof code === 'number' && Number.isFinite(code) ? code : null,
    notes,
  };
}

export function compareVersions(left: string, right: string): number {
  const parts = (value: string) =>
    value.split('.').map((part) => {
      const digits = /^(\d+)/.exec(part);
      return digits ? Number.parseInt(digits[1] ?? '0', 10) : 0;
    });
  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerNativeRelease(
  installed: { version: string; androidVersionCode: number | null },
  published: PublishedNativeApp,
): boolean {
  if (published.androidVersionCode !== null && installed.androidVersionCode !== null) {
    if (published.androidVersionCode !== installed.androidVersionCode) {
      return published.androidVersionCode > installed.androidVersionCode;
    }
  }
  return compareVersions(published.version, installed.version) > 0;
}
