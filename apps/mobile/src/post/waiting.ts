/** Há quanto tempo o animal espera um lar, em palavras. Sem React Native, para o node:test. */
export function waitingDays(since: string, now: Date = new Date()): number {
  const start = Date.parse(since);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000));
}

/** "Esperando há 3 semanas", "Esperando há 2 meses". Menos de uma semana não chama atenção. */
export function waitingLabel(
  since: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!since) return null;
  const days = waitingDays(since, now);
  if (days < 7) return null;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Esperando há 1 semana' : `Esperando há ${weeks} semanas`;
  }
  const months = Math.floor(days / 30);
  return `Esperando há ${months} meses`;
}

/** Versão curta para o card pequeno: "Há 3 semanas", "Há 2 meses". */
export function waitingShort(
  since: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const label = waitingLabel(since, now);
  return label ? label.replace('Esperando há', 'Há') : null;
}
