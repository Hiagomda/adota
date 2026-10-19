import { z } from 'zod';

/**
 * Ficha de quem quer adotar. Perguntas curtas, de tocar, que quem cuida faria na primeira
 * conversa. Nada aqui é documento nem endereço: só o suficiente para a conversa começar melhor.
 */
export const adoptionInterestSchema = z
  .object({
    home: z.enum(['house', 'apartment', 'other']),
    /** Tela nas janelas, muro alto ou portão fechado: o animal não sai sozinho. */
    safeHome: z.enum(['yes', 'no', 'will_do']),
    otherAnimals: z.enum(['none', 'dogs', 'cats', 'both']),
    household: z.enum(['alone', 'all_agree', 'not_sure']),
    hadPets: z.boolean(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export type AdoptionInterestInput = z.infer<typeof adoptionInterestSchema>;

/** Dia e hora vêm com fuso; a feira dura de 30 min a 12 h e começa no máximo em 6 meses. */
export const adoptionEventSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).optional(),
    placeLabel: z.string().trim().min(1).max(160),
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const starts = Date.parse(value.startsAt);
    const ends = Date.parse(value.endsAt);
    const minutes = (ends - starts) / 60_000;
    if (!(minutes >= 30 && minutes <= 12 * 60)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'A feira precisa durar de meia hora a 12 horas.',
      });
    }
    if (starts > Date.now() + 183 * 24 * 60 * 60_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startsAt'],
        message: 'Divulgue a feira com até 6 meses de antecedência.',
      });
    }
  });

export type AdoptionEventInput = z.infer<typeof adoptionEventSchema>;

/** Pedido de selo. Versões antigas do app mandam só o nome e a nota. */
export const verificationRequestSchema = z
  .object({
    kind: z.enum(['ngo', 'protector']).default('ngo'),
    organizationName: z.string().trim().min(2).max(120),
    instagram: z
      .string()
      .trim()
      .max(60)
      .transform((value) => value.replace(/^@+/, '').trim())
      .refine((value) => value === '' || /^[A-Za-z0-9._]{1,30}$/.test(value), {
        message: 'Confira o @ do Instagram.',
      })
      .optional(),
    cnpj: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.replace(/\D/g, ''))
      .refine((value) => value === '' || value.length === 14, {
        message: 'O CNPJ tem 14 números.',
      })
      .optional(),
    neighborhood: z.string().trim().max(80).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strip();

export type VerificationRequestInput = z.infer<typeof verificationRequestSchema>;

/** Dias inteiros entre duas datas, nunca negativo. */
export function daysWaiting(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}
