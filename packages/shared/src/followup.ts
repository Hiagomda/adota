import { z } from 'zod';

/**
 * Acompanhamento depois da adoção: check-ins aos 7, 30 e 90 dias. O tutor responde como vai a
 * adaptação; "difícil" ou "quero orientação" avisam quem cuidava do animal.
 */
export const CHECKIN_DAYS = [7, 30, 90] as const;
export type CheckinDay = (typeof CHECKIN_DAYS)[number];

/** Um check-in que passou disso sem aviso não é mais mandado (adoções antigas, API parada). */
export const CHECKIN_LATE_DAYS = 14;

const DAY_MS = 86_400_000;

export const checkinMoodSchema = z.enum(['great', 'ok', 'hard']);
export type CheckinMood = z.infer<typeof checkinMoodSchema>;

export const checkinAnswerSchema = z
  .object({
    mood: checkinMoodSchema,
    note: z.string().trim().max(500).optional(),
    wantsHelp: z.boolean().default(false),
  })
  .strict();
export type CheckinAnswer = z.infer<typeof checkinAnswerSchema>;

export const adopterSchema = z.object({ userId: z.string().uuid() }).strict();

export function checkinDueAt(adoptedAt: Date, day: CheckinDay): Date {
  return new Date(adoptedAt.getTime() + day * DAY_MS);
}

/** Os check-ins que já chegaram, do primeiro ao último. */
export function dueCheckinDays(adoptedAt: Date, now: Date = new Date()): CheckinDay[] {
  return CHECKIN_DAYS.filter((day) => checkinDueAt(adoptedAt, day).getTime() <= now.getTime());
}

/** Os que devem ser avisados agora: já chegaram e não passaram do prazo de atraso. */
export function checkinsToNotify(adoptedAt: Date, now: Date = new Date()): CheckinDay[] {
  return dueCheckinDays(adoptedAt, now).filter(
    (day) => now.getTime() - checkinDueAt(adoptedAt, day).getTime() <= CHECKIN_LATE_DAYS * DAY_MS,
  );
}

/** Pede atenção de quem cuidava: adaptação difícil ou pedido de orientação. */
export function checkinNeedsAttention(answer: Pick<CheckinAnswer, 'mood' | 'wantsHelp'>): boolean {
  return answer.mood === 'hard' || answer.wantsHelp;
}
