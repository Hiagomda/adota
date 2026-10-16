// The web preview cannot load react-native-nitro-google-signin: Nitro reaches into native-only
// React Native internals and the whole bundle fails to start. Same API, e-mail login only.

/** Shown on the welcome screen. An empty message means the person dismissed the picker. */
export class GoogleSignInNotice extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSignInNotice';
  }
}

export async function requestGoogleIdToken(): Promise<string | null> {
  throw new GoogleSignInNotice('Na versão web, entre com e-mail e senha.');
}

/** There is no Google session to clear on the web preview. */
export async function signOutGoogle(): Promise<void> {}
