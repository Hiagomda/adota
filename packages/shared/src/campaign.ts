import { z } from 'zod';
import { belemToday, calendarDay } from './passport.js';

/**
 * Campanhas de arrecadação. O app não recebe nem repassa dinheiro: quem doa paga pelo Pix do
 * responsável verificado, fora do app. O progresso soma só o que o responsável confirmou com
 * comprovante; o aviso "fiz um Pix" de quem doou fica pendente até ele conferir no extrato.
 */

/** R$ 10,00 a R$ 1.000.000,00, em centavos. */
export const MIN_GOAL_CENTS = 1_000;
export const MAX_GOAL_CENTS = 100_000_000;
export const MAX_ENTRY_CENTS = 100_000_000;
/** Uma campanha dura no máximo um ano. */
export const MAX_CAMPAIGN_DAYS = 365;
/** Avisos de doação ainda sem resposta que uma pessoa pode ter numa campanha. */
export const MAX_PENDING_PLEDGES = 3;

const clientKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

/** O mesmo formato que `/uploads/presign` devolve: a foto é um envio de alguma conta. */
const receiptKey = z
  .string()
  .regex(
    /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i,
    'O comprovante precisa ser uma foto enviada pelo app.',
  );

const cents = (max: number) => z.number().int().positive().max(max);

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function deadlineIssue(deadline: string, today: string): string | null {
  if (deadline < today) return 'O prazo não pode ser no passado.';
  if (deadline > addDays(today, MAX_CAMPAIGN_DAYS)) return 'O prazo pode ser de até um ano.';
  return null;
}

export function campaignCreateSchemaAt(now: Date = new Date()) {
  return z
    .object({
      title: z.string().trim().min(6).max(80),
      /** A justificativa: para que é o dinheiro e por que esse valor. */
      purpose: z.string().trim().min(30).max(2000),
      goalCents: cents(MAX_GOAL_CENTS).min(MIN_GOAL_CENTS),
      deadline: calendarDay,
      pixKey: z.string().trim().min(3).max(120),
      animalId: z.string().uuid().optional(),
      postId: z.string().uuid().optional(),
      clientKey,
    })
    .strict()
    .superRefine((value, context) => {
      const issue = deadlineIssue(value.deadline, belemToday(now));
      if (issue) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['deadline'], message: issue });
      }
    });
}

export const campaignCreateSchema = campaignCreateSchemaAt();

/** Toda edição pede o motivo, que fica no histórico junto com o antes e o depois. */
export function campaignUpdateSchemaAt(now: Date = new Date()) {
  return z
    .object({
      title: z.string().trim().min(6).max(80).optional(),
      purpose: z.string().trim().min(30).max(2000).optional(),
      goalCents: cents(MAX_GOAL_CENTS).min(MIN_GOAL_CENTS).optional(),
      deadline: calendarDay.optional(),
      pixKey: z.string().trim().min(3).max(120).optional(),
      reason: z.string().trim().min(10).max(300),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.deadline) {
        const issue = deadlineIssue(value.deadline, belemToday(now));
        if (issue) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['deadline'], message: issue });
        }
      }
      const changes = ['title', 'purpose', 'goalCents', 'deadline', 'pixKey'] as const;
      if (!changes.some((field) => value[field] !== undefined)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['title'],
          message: 'Nada mudou na campanha.',
        });
      }
    });
}

export const campaignUpdateSchema = campaignUpdateSchemaAt();

function notInFuture(now: Date) {
  return (value: { occurredOn: string }, context: z.RefinementCtx) => {
    if (value.occurredOn > belemToday(now)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurredOn'],
        message: 'A data não pode ser no futuro.',
      });
    }
  };
}

/** Lançamento do responsável: doação recebida ou despesa paga, sempre com comprovante. */
export function campaignEntrySchemaAt(now: Date = new Date()) {
  return z
    .object({
      kind: z.enum(['donation', 'expense']),
      amountCents: cents(MAX_ENTRY_CENTS),
      description: z.string().trim().min(3).max(200),
      occurredOn: calendarDay,
      receiptKey,
      clientKey,
    })
    .strict()
    .superRefine(notInFuture(now));
}

export const campaignEntrySchema = campaignEntrySchemaAt();

/** "Fiz um Pix": aviso de quem doou. Não soma até o responsável confirmar. */
export function campaignPledgeSchemaAt(now: Date = new Date()) {
  return z
    .object({
      amountCents: cents(MAX_ENTRY_CENTS),
      occurredOn: calendarDay,
      receiptKey: receiptKey.optional(),
      showName: z.boolean().default(false),
      clientKey,
    })
    .strict()
    .superRefine(notInFuture(now));
}

export const campaignPledgeSchema = campaignPledgeSchemaAt();

/** Confirmar exige comprovante: o de quem doou ou um que o responsável anexa agora. */
export const campaignConfirmSchema = z.object({ receiptKey: receiptKey.optional() }).strict();

export const campaignDecisionNoteSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();

/** Anular é a única correção: o lançamento continua visível, riscado, com o motivo. */
export const campaignVoidSchema = z.object({ reason: z.string().trim().min(10).max(300) }).strict();

/** Encerrar pede a prestação de contas final em texto. */
export const campaignCloseSchema = z.object({ note: z.string().trim().min(20).max(2000) }).strict();

export const campaignListQuerySchema = z
  .object({
    status: z.enum(['open', 'ended', 'mine']).default('open'),
    animalId: z.string().uuid().optional(),
    postId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();

export type CampaignStatus = 'active' | 'closed' | 'suspended';
/** O que a pessoa vê: ativa, prazo acabou, encerrada pelo responsável ou suspensa pela equipe. */
export type CampaignPhase = 'active' | 'ended' | 'closed' | 'suspended';

export function campaignPhase(status: string, deadline: string, today: string): CampaignPhase {
  if (status === 'suspended') return 'suspended';
  if (status === 'closed') return 'closed';
  return deadline < today ? 'ended' : 'active';
}

/** Somas do livro-caixa. Só confirmado entra; pendente aparece separado e nunca soma. */
export function campaignTotals(
  entries: readonly { kind: string; status: string; amountCents: number }[],
): {
  raisedCents: number;
  spentCents: number;
  balanceCents: number;
  pendingCents: number;
  pendingCount: number;
} {
  let raised = 0;
  let spent = 0;
  let pending = 0;
  let pendingCount = 0;
  for (const entry of entries) {
    if (entry.status === 'confirmed') {
      if (entry.kind === 'donation') raised += entry.amountCents;
      if (entry.kind === 'expense') spent += entry.amountCents;
    }
    if (entry.status === 'pending' && entry.kind === 'donation') {
      pending += entry.amountCents;
      pendingCount += 1;
    }
  }
  return {
    raisedCents: raised,
    spentCents: spent,
    balanceCents: raised - spent,
    pendingCents: pending,
    pendingCount,
  };
}

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;
export type CampaignEntryInput = z.infer<typeof campaignEntrySchema>;
export type CampaignPledgeInput = z.infer<typeof campaignPledgeSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
