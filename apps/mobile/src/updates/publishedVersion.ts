export type PublishedNativeApp = {
  version: string;
  androidVersionCode: number | null;
  notes: string[];
  /**
   * A versão nova vem assinada com outra chave: o Android recusa instalar por cima, então a
   * pessoa precisa desinstalar e instalar de novo. Campo opcional do `version.json`.
   */
  reinstall: boolean;
};

export function parsePublishedNativeApp(value: unknown): PublishedNativeApp | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string' || record.version.trim() === '') return null;
  const code = record.androidVersionCode;
  const notes = Array.isArray(record.notes)
    ? record.notes
        .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        .slice(0, 4)
    : [];
  return {
    version: record.version.trim(),
    androidVersionCode: typeof code === 'number' && Number.isFinite(code) ? code : null,
    notes,
    reinstall: record.reinstall === true,
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
