import { z } from 'zod';

/**
 * Agenda de eventos e mutirões: feiras de adoção, vacinação, castração, arrecadação e ações
 * da comunidade. Tudo no horário de Belém (America/Belem, UTC-3 o ano todo, sem horário de
 * verão). As feiras antigas viram a categoria `adoption_fair`.
 */
export const eventCategorySchema = z.enum([
  'adoption_fair',
  'vaccination',
  'neutering',
  'fundraising',
  'community',
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

/** Categorias que só perfil verificado (ONG ou protetor) ou a equipe pode marcar. */
export const verifiedOnlyCategories: readonly EventCategory[] = ['adoption_fair', 'fundraising'];

/** O que o evento precisa. Sem transporte: carona não existe no app. */
export const eventNeedSchema = z.enum(['volunteers', 'food', 'supplies', 'vets', 'space']);
export type EventNeed = z.infer<typeof eventNeedSchema>;

export const eventPeriodSchema = z.enum(['upcoming', 'today', 'week', 'month', 'past']);
export type EventPeriod = z.infer<typeof eventPeriodSchema>;

export const EVENT_TIME_ZONE = 'America/Belem';
const BELEM_OFFSET_MS = -3 * 3_600_000;
const MAX_AHEAD_MS = 183 * 24 * 3_600_000;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

const eventFields = {
  title: text(3, 80),
  description: z.string().trim().max(500).optional(),
  category: eventCategorySchema.default('adoption_fair'),
  placeLabel: text(1, 160),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(2000).nullable().optional(),
  needs: z
    .array(eventNeedSchema)
    .max(5)
    .transform((values) => [...new Set(values)])
    .optional(),
  needsNote: z.string().trim().max(300).optional(),
  /** Chave do celular para o reenvio depois de cair a internet não criar outro evento. */
  clientKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
};

type Range = { startsAt?: string; endsAt?: string };

/** Dura de 30 min a 12 h e começa no máximo em 6 meses. */
function checkRange(value: Range, context: z.RefinementCtx, now: number): void {
  if (!value.startsAt || !value.endsAt) return;
  const starts = Date.parse(value.startsAt);
  const ends = Date.parse(value.endsAt);
  const minutes = (ends - starts) / 60_000;
  if (!(minutes >= 30 && minutes <= 12 * 60)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'O evento precisa durar de meia hora a 12 horas.',
    });
  }
  if (starts > now + MAX_AHEAD_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startsAt'],
      message: 'Divulgue o evento com até 6 meses de antecedência.',
    });
  }
}

export function communityEventSchemaAt(now: Date = new Date()) {
  return z
    .object(eventFields)
    .strict()
    .superRefine((value, context) => checkRange(value, context, now.getTime()));
}

export const communityEventSchema = communityEventSchemaAt();
export type CommunityEventInput = z.infer<typeof communityEventSchema>;

/**
 * Edição: manda só o que mudou e a versão que a pessoa viu. Se outra edição entrou antes, a
 * API recusa em vez de apagar a mudança da outra pessoa. Dia e hora vão sempre juntos.
 */
export function eventUpdateSchemaAt(now: Date = new Date()) {
  const { clientKey: _clientKey, category: _category, ...editable } = eventFields;
  return z
    .object({
      ...editable,
      category: eventCategorySchema,
      version: z.number().int().min(1),
    })
    .partial()
    .required({ version: true })
    .strict()
    .superRefine((value, context) => {
      if ((value.startsAt === undefined) !== (value.endsAt === undefined)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endsAt'],
          message: 'Mande o início e o fim juntos.',
        });
      }
      if ((value.latitude === undefined) !== (value.longitude === undefined)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['longitude'],
          message: 'Mande o ponto inteiro.',
        });
      }
      checkRange(value, context, now.getTime());
    });
}

export const eventUpdateSchema = eventUpdateSchemaAt();
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

export const eventCancelSchema = z.object({ reason: z.string().trim().min(5).max(300) }).strict();

export const eventRegistrationSchema = z
  .object({ note: z.string().trim().max(200).optional() })
  .strict();

export const eventResultSchema = z
  .object({
    summary: z.string().trim().min(3).max(500),
    adoptions: z.number().int().min(0).max(1000).optional(),
    animalsServed: z.number().int().min(0).max(10000).optional(),
  })
  .strict();
export type EventResultInput = z.infer<typeof eventResultSchema>;

export const eventReportSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/** AAAA-MM do calendário. */
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const eventListQuerySchema = z
  .object({
    category: eventCategorySchema.optional(),
    period: eventPeriodSchema.default('upcoming'),
    /** Mês do calendário; quando vem, vale no lugar do período. */
    month: monthKey.optional(),
    neighborhood: z.string().trim().min(1).max(80).optional(),
    latitude: z.coerce.number().gte(-90).lte(90).optional(),
    longitude: z.coerce.number().gte(-180).lte(180).optional(),
    radiusKm: z.coerce.number().int().min(1).max(100).optional(),
    mine: z.enum(['organizing', 'registered']).optional(),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

/**
 * Janela de tempo de um período, em instantes UTC. `today`, `week` e `month` contam do começo
 * do dia de hoje em Belém; `upcoming` é tudo que ainda não terminou; `past` é o que terminou.
 */
export function eventWindow(
  query: { period: EventPeriod; month?: string },
  now: Date = new Date(),
): { from: Date | null; to: Date | null; past: boolean } {
  if (query.month) {
    const [year, month] = query.month.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, month - 1, 1) - BELEM_OFFSET_MS);
    const to = new Date(Date.UTC(year, month, 1) - BELEM_OFFSET_MS);
    return { from, to, past: false };
  }
  const local = new Date(now.getTime() + BELEM_OFFSET_MS);
  const startOfDay = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BELEM_OFFSET_MS,
  );
  const day = 24 * 3_600_000;
  switch (query.period) {
    case 'today':
      return { from: startOfDay, to: new Date(startOfDay.getTime() + day), past: false };
    case 'week':
      return { from: startOfDay, to: new Date(startOfDay.getTime() + 7 * day), past: false };
    case 'month':
      return { from: startOfDay, to: new Date(startOfDay.getTime() + 30 * day), past: false };
    case 'past':
      return { from: null, to: null, past: true };
    default:
      return { from: null, to: null, past: false };
  }
}

/** O bairro dentro do nome do lugar ("Praça X · Marco · Belém" ou "Marco, Belém"). */
export function neighborhoodFromPlace(label: string): string | null {
  const dotted = label
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (dotted.length >= 2) return (dotted[dotted.length - 2] ?? '').slice(0, 80) || null;
  const commas = label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (commas.length >= 2) {
    const last = commas[commas.length - 1] ?? '';
    // "Rua X, 12, Marco, Belém": o bairro vem antes da cidade.
    const candidate = /bel[eé]m|ananindeua|marituba|benevides/i.test(last)
      ? commas[commas.length - 2]
      : last;
    if (candidate && !/^-?\d/.test(candidate)) return candidate.slice(0, 80);
  }
  return null;
}

/** Vagas que sobram; `null` quando não tem limite. */
export function spotsLeft(capacity: number | null, registered: number): number | null {
  if (capacity === null) return null;
  return Math.max(0, capacity - registered);
}
