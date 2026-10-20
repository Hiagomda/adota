/**
 * De quem é um token: o `sub` do token do Firebase (a conta) ou o próprio `dev:<email>` local.
 * Só lê a carga do token para comparar contas; quem confere a assinatura é a API.
 */
export function tokenAccount(token: string): string | null {
  if (token.startsWith('dev:')) return token;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(atob(padded));
    if (typeof claims !== 'object' || claims === null) return null;
    const sub = (claims as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    // Carga que não é base64 nem JSON não identifica conta; a fila espera em vez de adivinhar.
    return null;
  }
}

/**
 * O token para mandar um resgate da fila. O token salvo junto do rascunho vence em uma hora,
 * então vale o da sessão de agora, desde que seja da mesma conta que escreveu o resgate.
 * Sem sessão ou com outra conta, devolve null e o rascunho continua esperando.
 */
export function tokenForDraft(draftToken: string, current: string | null): string | null {
  if (!current) return null;
  const author = tokenAccount(draftToken);
  return author !== null && author === tokenAccount(current) ? current : null;
}
