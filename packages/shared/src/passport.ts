import { z } from 'zod';

/**
 * Passaporte do animal: o que aconteceu com ele ao longo do tempo, mesmo quando apareceu em
 * mais de um post. Registros de saúde são de quem cuida; o público vê só o que quem registrou
 * marcou como público (vacina e castração costumam ser).
 */
export const healthKindSchema = z.enum([
  'vaccine',
  'deworming',
  'neutering',
  'treatment',
  'medication',
  'exam',
  'vet_visit',
]);

export const healthVisibilitySchema = z.enum(['public', 'caretakers']);

/** AAAA-MM-DD, um dia do calendário. Sem hora: ninguém lembra a hora da vacina. */
export const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    // 31/02 vira 03/03 no Date: só vale o dia que volta igual.
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data inválida.');

/** O dia de hoje no calendário de Belém (UTC-3, sem horário de verão). */
export function belemToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export function healthRecordSchemaAt(now: Date = new Date()) {
  return z
    .object({
      kind: healthKindSchema,
      title: z.string().trim().min(2).max(80),
      notes: z.string().trim().max(500).optional(),
      occurredOn: calendarDay,
      nextDueOn: calendarDay.nullable().optional(),
      visibility: healthVisibilitySchema.default('caretakers'),
      /** Gerada pelo celular: reenviar o mesmo registro não cria outro. */
      clientKey: z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/)
        .optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.occurredOn > belemToday(now)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurredOn'],
          message: 'A data do registro não pode ser no futuro.',
        });
      }
      if (value.occurredOn < '1990-01-01') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurredOn'],
          message: 'Confira a data do registro.',
        });
      }
      if (value.nextDueOn && value.nextDueOn <= value.occurredOn) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nextDueOn'],
          message: 'A próxima dose precisa ser depois do registro.',
        });
      }
    });
}

export const healthRecordSchema = healthRecordSchemaAt();

/** "Este é o mesmo animal daquele outro post." */
export const animalLinkSchema = z
  .object({
    postId: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export type HealthKind = z.infer<typeof healthKindSchema>;
export type HealthVisibility = z.infer<typeof healthVisibilitySchema>;
export type HealthRecordInput = z.infer<typeof healthRecordSchema>;
export type AnimalLinkInput = z.infer<typeof animalLinkSchema>;

export type CustodyKind = 'rescue' | 'foster' | 'adoption';

/**
 * Que guarda abre e quais fecham quando o status muda. Resgatado é quem tirou da rua; lar
 * temporário e adoção são as casas por onde ele passa. Voltar para a rua ou para adoção fecha
 * a guarda que estava aberta.
 */
export function custodyChange(
  from: string,
  to: string,
): { close: CustodyKind[]; open: CustodyKind | null } {
  if (from === to) return { close: [], open: null };
  const open: CustodyKind | null =
    to === 'rescued'
      ? 'rescue'
      : to === 'fostered'
        ? 'foster'
        : to === 'adopted'
          ? 'adoption'
          : null;
  const close: CustodyKind[] = [];
  if (from === 'rescued') close.push('rescue');
  if (from === 'fostered') close.push('foster');
  if (from === 'adopted') close.push('adoption');
  return { close, open };
}
