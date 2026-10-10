import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

/** Shown on the welcome screen. An empty message means the person dismissed the picker. */
export class GoogleSignInNotice extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSignInNotice';
  }
}

let configured = false;

function webClientId(): string {
  const id = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!id) {
    throw new GoogleSignInNotice('O login com Google ainda não foi configurado neste aplicativo.');
  }
  return id;
}

function ensureConfigured(): void {
  if (configured) return;
  GoogleOneTapSignIn.configure({ webClientId: webClientId() });
  configured = true;
}

function noticeFor(error: unknown): GoogleSignInNotice {
  if (error instanceof GoogleSignInNotice) return error;
  if (isErrorWithCode(error)) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) return new GoogleSignInNotice('');
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new GoogleSignInNotice('Este celular não tem o Google Play atualizado.');
    }
    if (error.code === statusCodes.DEVELOPER_ERROR) {
      return new GoogleSignInNotice(
        'O login com Google não foi aceito neste app. Atualize e tente de novo.',
      );
    }
  }
  return new GoogleSignInNotice('Não consegui entrar com o Google. Tente de novo.');
}

/**
 * Opens the Android account picker on top of the app and returns the Google ID token.
 * Returns null when the person closes the picker.
 */
export async function requestGoogleIdToken(): Promise<string | null> {
  try {
    ensureConfigured();
    await GoogleOneTapSignIn.checkPlayServices(false);
    let response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.createAccount();
    }
    if (isCancelledResponse(response)) return null;
    if (!isSuccessResponse(response) || response.data.idToken.split('.').length !== 3) {
      throw new GoogleSignInNotice('Não consegui entrar com o Google. Tente de novo.');
    }
    return response.data.idToken;
  } catch (error) {
    const notice = noticeFor(error);
    if (!notice.message) return null;
    throw notice;
  }
}

/** Clears the Google session so the next login can pick another account. */
export async function signOutGoogle(): Promise<void> {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) return;
  try {
    ensureConfigured();
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Leaving the app account still has to succeed when Google was never used.
  }
}
