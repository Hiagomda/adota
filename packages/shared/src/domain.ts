import { z } from 'zod';

export const roleSchema = z.enum(['user', 'protector', 'ngo', 'admin']);
export const speciesSchema = z.enum(['dog', 'cat', 'other']);
export const sizeSchema = z.enum(['small', 'medium', 'large']);
export const sexSchema = z.enum(['male', 'female', 'unknown']);
export const animalStatusSchema = z.enum([
  'open',
  'on_the_way',
  'rescued',
  'fostered',
  'for_adoption',
  'adopted',
]);
export const postTypeSchema = z.enum([
  'rescue_alert',
  'update',
  'adoption',
  'help_request',
  'lost',
]);
export const urgencySchema = z.enum(['low', 'medium', 'high']);
export const responseKindSchema = z.enum(['will_help', 'seen', 'has_foster', 'can_donate']);
export const helpKindSchema = z.enum(['food', 'vet', 'castration', 'transport']);
export const reviewStatusSchema = z.enum(['published', 'pending', 'rejected']);

export const statusTransitions: Record<
  z.infer<typeof animalStatusSchema>,
  readonly z.infer<typeof animalStatusSchema>[]
> = {
  open: ['on_the_way'],
  on_the_way: ['rescued'],
  rescued: ['fostered'],
  fostered: ['for_adoption'],
  for_adoption: ['adopted'],
  adopted: [],
};

export function canTransitionStatus(
  from: z.infer<typeof animalStatusSchema>,
  to: z.infer<typeof animalStatusSchema>,
): boolean {
  return statusTransitions[from].includes(to);
}

const salePattern = /\b(vendo|vender|vendendo|venda|preço|preco)\b|à venda|a venda|r\$\s*\d+/i;

export function looksLikeAnimalSale(description: string): boolean {
  return salePattern.test(description);
}

export const createPostSchema = z.object({
  type: postTypeSchema.default('rescue_alert'),
  species: speciesSchema,
  size: sizeSchema,
  sex: sexSchema.optional(),
  ageEstimate: z.string().max(40).optional(),
  healthNotes: z.string().max(500).optional(),
  temperament: z.string().max(200).optional(),
  urgency: urgencySchema,
  description: z.string().trim().min(1).max(2000),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  approxLabel: z.string().trim().min(1).max(120),
  parentPostId: z.string().uuid().optional(),
  media: z
    .array(
      z.object({
        url: z.string().trim().min(1).max(2000),
      }),
    )
    .max(5),
  helpRequest: z
    .object({
      kind: helpKindSchema,
      goalAmount: z.number().positive().nullable().optional(),
      pixKey: z.string().trim().max(120).nullable().optional(),
      deadline: z.string().datetime().nullable().optional(),
    })
    .optional(),
});

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
  latitude: z.coerce.number().gte(-90).lte(90).optional(),
  longitude: z.coerce.number().gte(-180).lte(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  species: speciesSchema.optional(),
  size: sizeSchema.optional(),
  urgency: urgencySchema.optional(),
  status: animalStatusSchema.optional(),
  type: postTypeSchema.optional(),
  authorId: z.string().uuid().optional(),
  saved: z.enum(['true', 'false']).optional(),
  adopted: z.enum(['true', 'false']).optional(),
});

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9._]{3,24}$/)
    .optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  whatsappOptIn: z.boolean().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  alertRadiusKm: z.number().int().min(1).max(100).optional(),
  avatarUrl: z.string().trim().url().nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
});

export const presignSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        bytes: z.number().int().positive().max(8_000_000),
      }),
    )
    .min(1)
    .max(5),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type AnimalStatus = z.infer<typeof animalStatusSchema>;
export type PostType = z.infer<typeof postTypeSchema>;
export type Urgency = z.infer<typeof urgencySchema>;
export type UserRole = z.infer<typeof roleSchema>;
