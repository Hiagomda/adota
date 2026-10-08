import { z } from 'zod';

export const volunteerActionSchema = z.enum([
  'report',
  'transport',
  'foster',
  'donation',
  'adoption',
]);

export const fosterPetTypeSchema = z.enum(['dog', 'cat', 'other']);

export const volunteerSettingsSchema = z
  .object({
    isTransportAvailable: z.boolean(),
    isFosterAvailable: z.boolean(),
    fosterPetTypes: z.array(fosterPetTypeSchema).max(3),
    fosterMaxDays: z.number().int().min(1).max(365).nullable(),
    serviceRadiusKm: z.number().int().min(1).max(100),
  })
  .superRefine((value, context) => {
    if (value.isFosterAvailable && value.fosterPetTypes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fosterPetTypes'],
        message: 'Escolha pelo menos um tipo de animal.',
      });
    }
    if (value.isFosterAvailable && value.fosterMaxDays === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fosterMaxDays'],
        message: 'Diga por quantos dias você pode acolher.',
      });
    }
  });

export const claimVolunteerXpSchema = z
  .object({
    actionType: volunteerActionSchema,
    days: z.number().int().min(1).max(90).optional(),
    amountReais: z.number().int().min(1).max(20000).optional(),
    sourceId: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((value, context) => {
    if (value.actionType === 'foster' && value.days === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['days'],
        message: 'Informe quantos dias de lar temporário.',
      });
    }
    if (value.actionType === 'donation' && value.amountReais === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountReais'],
        message: 'Informe o valor da doação.',
      });
    }
  });

export type VolunteerAction = z.infer<typeof volunteerActionSchema>;
export type VolunteerSettingsInput = z.infer<typeof volunteerSettingsSchema>;
export type ClaimVolunteerXpInput = z.infer<typeof claimVolunteerXpSchema>;

export function pointsForVolunteerAction(input: ClaimVolunteerXpInput): number {
  if (input.actionType === 'report') return 20;
  if (input.actionType === 'transport') return 150;
  if (input.actionType === 'foster') return 100 * (input.days ?? 0);
  if (input.actionType === 'donation') return input.amountReais ?? 0;
  return 500;
}

export const volunteerBadgeCatalog = [
  { code: 'local_hero', name: 'Herói local' },
  { code: 'good_pilot', name: 'Piloto do bem' },
  { code: 'open_doors', name: 'Portas abertas' },
  { code: 'top_sponsor', name: 'Padrinho nota 10' },
  { code: 'neighborhood_scout', name: 'Olheiro da vizinhança' },
] as const;

export type VolunteerBadgeCode = (typeof volunteerBadgeCatalog)[number]['code'];

export function levelForXp(xp: number): {
  code: 'scout' | 'local_guardian' | 'active_protector' | 'guardian_angel';
  name: string;
  floor: number;
  ceiling: number | null;
  progress: number;
} {
  if (xp <= 100) {
    return { code: 'scout', name: 'Olheiro', floor: 0, ceiling: 100, progress: clamp(xp / 100) };
  }
  if (xp <= 500) {
    return {
      code: 'local_guardian',
      name: 'Guardião local',
      floor: 101,
      ceiling: 500,
      progress: clamp((xp - 101) / (500 - 101)),
    };
  }
  if (xp <= 2000) {
    return {
      code: 'active_protector',
      name: 'Protetor ativo',
      floor: 501,
      ceiling: 2000,
      progress: clamp((xp - 501) / (2000 - 501)),
    };
  }
  return {
    code: 'guardian_angel',
    name: 'Anjo da guarda',
    floor: 2001,
    ceiling: null,
    progress: 1,
  };
}

export function badgesForAction(action: VolunteerAction, xp: number): VolunteerBadgeCode[] {
  const earned = new Set<VolunteerBadgeCode>();
  if (action === 'report') earned.add('neighborhood_scout');
  if (action === 'transport') earned.add('good_pilot');
  if (action === 'foster') earned.add('open_doors');
  if (action === 'donation') earned.add('top_sponsor');
  if (action === 'adoption' || xp >= 101) earned.add('local_hero');
  return [...earned];
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
