interface GoogleAppConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/**
 * GitHub Pages origin. Firebase rejects the sslip.io download host, and this
 * host is added as an authorized auth domain. The page lives at /adota/google.html.
 */
export const GOOGLE_HANDOFF_ORIGIN = 'https://hiagomda.github.io/adota';

/** Page that finishes Google sign-in in the browser and returns to the app. */
export function googleHandoffUrl(pageOrigin: string, options: GoogleAppConfig): string {
  const base = pageOrigin.replace(/\/$/, '');
  const hash = new URLSearchParams({
    apiKey: options.apiKey,
    authDomain: options.authDomain,
    projectId: options.projectId,
    appId: options.appId,
  });
  return `${base}/google.html#${hash.toString()}`;
}

/** Google ID token carried back on `egua://auth?id_token=`. */
export function googleIdTokenFromUrl(url: string): string | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex < 0) return null;
  const query = url.slice(queryIndex + 1).split('#')[0] ?? '';
  const token = new URLSearchParams(query).get('id_token');
  if (!token || token.split('.').length !== 3) return null;
  return token;
}
