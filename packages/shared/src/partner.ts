import { z } from 'zod';
import { normalizeWhatsApp } from './phone.js';
import { insideServiceArea } from './serviceArea.js';

/**
 * Parceiros do Cupu: petshops, clínicas e lojas que aparecem no mapa e em cartões de anúncio.
 * O app nunca recebe dinheiro: o parceiro entra de graça em troca de uma vantagem para quem
 * adota ou resgata, e a equipe aprova cada pedido antes de ele aparecer.
 */
export const partnerKindSchema = z.enum([
  'petshop',
  'vet',
  'clinic_24h',
  'feed_store',
  'grooming',
  'other',
]);
export type PartnerKind = z.infer<typeof partnerKindSchema>;

export const partnerStatusSchema = z.enum(['pending', 'approved', 'rejected', 'paused']);
export type PartnerStatus = z.infer<typeof partnerStatusSchema>;

export const PARTNER_NAME_MAX = 80;
export const PARTNER_ABOUT_MAX = 300;
export const PARTNER_PERK_MAX = 200;
export const PARTNER_HOURS_MAX = 120;
export const PARTNER_ADDRESS_MAX = 160;
/** Pedidos esperando a equipe por pessoa: segura quem manda o mesmo cadastro várias vezes. */
export const MAX_PENDING_PARTNERS = 3;

const instagram = z
  .string()
  .trim()
  .max(31)
  .transform((value) => value.replace(/^@/, ''))
  .refine((value) => value === '' || /^[A-Za-z0-9._]{1,30}$/.test(value), {
    message: 'Escreva só o @ do Instagram, sem link.',
  });

const whatsapp = z
  .string()
  .trim()
  .max(30)
  .transform((value, context) => {
    const normalized = normalizeWhatsApp(value);
    if (!normalized) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confira o WhatsApp: DDD e número, como (91) 98888-7777.',
      });
      return z.NEVER;
    }
    return normalized;
  });

const partnerFields = {
  name: z.string().trim().min(2).max(PARTNER_NAME_MAX),
  kind: partnerKindSchema,
  about: z.string().trim().max(PARTNER_ABOUT_MAX).optional(),
  perk: z
    .string()
    .trim()
    .min(5, { message: 'Conte a vantagem que você oferece, em poucas palavras.' })
    .max(PARTNER_PERK_MAX),
  hours: z.string().trim().max(PARTNER_HOURS_MAX).optional(),
  addressText: z.string().trim().min(3).max(PARTNER_ADDRESS_MAX),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  whatsapp,
  instagram: instagram.optional(),
};

export const partnerRequestSchema = z
  .object(partnerFields)
  .strict()
  .refine(insideServiceArea, { message: 'Por enquanto só aparecem parceiros de Belém.' });
export type PartnerRequestInput = z.infer<typeof partnerRequestSchema>;

/** Quem pediu edita os dados; editar volta para a fila da equipe. */
export const partnerUpdateSchema = partnerRequestSchema;
export type PartnerUpdateInput = PartnerRequestInput;

/** Quem pediu tira do mapa (férias, reforma) e volta quando quiser, sem nova aprovação. */
export const partnerPauseSchema = z.object({ paused: z.boolean() }).strict();

export const partnerTapSchema = z.object({ kind: z.enum(['view', 'whatsapp', 'route']) }).strict();
export type PartnerTapKind = z.infer<typeof partnerTapSchema>['kind'];

export const partnerReviewSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'pause']),
    note: z.string().trim().max(300).optional(),
    featured: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.action === 'approve' || (value.note?.length ?? 0) >= 5, {
    message: 'Escreva o motivo para quem pediu.',
  });
export type PartnerReviewInput = z.infer<typeof partnerReviewSchema>;

export const partnerMapQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    kind: partnerKindSchema.optional(),
  })
  .strict()
  .refine((value) => value.west < value.east && value.south < value.north, {
    message: 'Área do mapa inválida.',
  });
export type PartnerMapQuery = z.infer<typeof partnerMapQuerySchema>;

/**
 * Para onde o cadastro vai quando a equipe decide. Recusado pode voltar à fila se quem pediu
 * editar; pausado pela equipe só volta com nova aprovação.
 */
export function nextPartnerStatus(
  from: PartnerStatus,
  action: PartnerReviewInput['action'],
): PartnerStatus | null {
  if (action === 'approve') return from === 'approved' ? null : 'approved';
  if (action === 'reject') return from === 'pending' ? 'rejected' : null;
  return from === 'approved' ? 'paused' : null;
}
