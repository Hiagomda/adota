export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'disabled'
  | 'too-many-requests'
  | 'offline'
  | 'unavailable'
  | 'unexpected';

const messages: Record<AuthErrorCode, string> = {
  'invalid-credentials': 'E-mail ou senha incorretos.',
  'email-in-use': 'Já existe uma conta com esse e-mail. Entre ou recupere a senha.',
  'weak-password': 'Use uma senha com pelo menos 8 caracteres.',
  disabled: 'Essa conta está desativada.',
  'too-many-requests': 'Muitas tentativas. Tente de novo em alguns minutos.',
  offline: 'Sem conexão. Verifique sua internet e tente de novo.',
  unavailable: 'O login ainda não foi configurado neste aplicativo.',
  unexpected: 'Não consegui entrar agora. Tente de novo.',
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(messages[code]);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** Maps a Firebase Auth error code to a message that does not say which field was wrong. */
export function mapFirebaseCode(code: string): AuthErrorCode {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'invalid-credentials';
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'email-in-use';
    case 'auth/weak-password':
      return 'weak-password';
    case 'auth/user-disabled':
      return 'disabled';
    case 'auth/too-many-requests':
      return 'too-many-requests';
    case 'auth/network-request-failed':
      return 'offline';
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
    case 'auth/operation-not-allowed':
      return 'unavailable';
    default:
      return 'unexpected';
  }
}

export function authErrorFrom(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  return new AuthError(mapFirebaseCode(code));
}
