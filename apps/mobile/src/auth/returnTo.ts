/** Keeps post-login navigation inside the app. Rejects protocol-relative and external URLs. */
export function safeReturnTo(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return null;
  return raw;
}
