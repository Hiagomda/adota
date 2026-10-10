/** Google ID token carried back on `egua://auth?id_token=`. */
export function googleIdTokenFromUrl(url: string): string | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return null;
  const query = url.slice(queryIndex + 1).split('#')[0] ?? '';
  const token = new URLSearchParams(query).get('id_token');
  if (!token || token.split('.').length !== 3) return null;
  return token;
}
