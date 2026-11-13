export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    /** Código fixo para o app reagir sem depender do texto (ex.: `account_suspended`). */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Conta suspensa pela equipe: o app desloga e mostra este texto, em vez de tentar de novo. */
export const ACCOUNT_SUSPENDED = 'account_suspended';
