export function stripControls(value: string): string {
  // The bytes themselves are the thing being removed from stored text.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}
