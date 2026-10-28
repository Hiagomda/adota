import { z } from 'zod';
import { fosterPetTypeSchema } from './volunteer.js';

/**
 * Casa Amiga: lar temporário com vagas. A casa é de alguém, então o endereço nunca sai do
 * servidor: quem procura vê a distância em km inteiros e combina o encontro depois do aceite.
 * Transporte não existe no app (decisão do dono); as ofertas são de comida, materiais e ajuda
 * com veterinário.
 */
export const fosterSizeSchema = z.enum(['small', 'medium', 'large']);
export const fosterOfferSchema = z.enum(['food', 'supplies', 'vet']);

export const fosterHomeSettingsSchema = z
  .object({
    isFosterAvailable: z.boolean(),
    fosterPetTypes: z.array(fosterPetTypeSchema).max(3),
    fosterSizes: z.array(fosterSizeSchema).max(3),
    fosterMaxDays: z.number().int().min(1).max(365).nullable(),
    capacity: z.number().int().min(1).max(20),
    acceptsSpecialNeeds: z.boolean(),
    offers: z.array(fosterOfferSchema).max(3),
    notes: z.string().trim().max(300).nullable().optional(),
    serviceRadiusKm: z.number().int().min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.isFosterAvailable) return;
    if (value.fosterPetTypes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fosterPetTypes'],
        message: 'Escolha pelo menos um tipo de animal.',
      });
    }
    if (value.fosterSizes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fosterSizes'],
        message: 'Escolha pelo menos um porte.',
      });
    }
    if (value.fosterMaxDays === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fosterMaxDays'],
        message: 'Diga por quantos dias você pode acolher.',
      });
    }
  });

export const fosterRequestSchema = z
  .object({
    fosterId: z.string().uuid(),
    message: z.string().trim().min(5).max(300),
    expectedDays: z.number().int().min(1).max(365).optional(),
    specialCare: z.boolean().optional(),
  })
  .strict();

export const fosterStayActionSchema = z.enum(['approve', 'decline', 'cancel', 'end']);

export type FosterHomeSettingsInput = z.infer<typeof fosterHomeSettingsSchema>;
export type FosterRequestInput = z.infer<typeof fosterRequestSchema>;
export type FosterStayAction = z.infer<typeof fosterStayActionSchema>;
export type FosterStayStatus = 'requested' | 'approved' | 'declined' | 'cancelled' | 'ended';

/**
 * Quem pode fazer o quê com um acolhimento. A Casa Amiga aceita, recusa e encerra; quem pediu
 * cancela enquanto não terminou e também encerra (o animal saiu da casa).
 */
export function fosterStayTransition(
  status: FosterStayStatus,
  action: FosterStayAction,
  actor: 'foster' | 'requester' | 'team',
): FosterStayStatus | null {
  const host = actor === 'foster' || actor === 'team';
  const asker = actor === 'requester' || actor === 'team';
  if (status === 'requested') {
    if (action === 'approve' && host) return 'approved';
    if (action === 'decline' && host) return 'declined';
    if (action === 'cancel' && asker) return 'cancelled';
    return null;
  }
  if (status === 'approved') {
    if (action === 'end') return 'ended';
    if (action === 'cancel') return 'cancelled';
    return null;
  }
  return null;
}

/** Vagas livres: a capacidade menos os acolhimentos aceitos que ainda não terminaram. */
export function freeSlots(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}
