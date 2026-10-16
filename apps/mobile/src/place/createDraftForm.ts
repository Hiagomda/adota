import { z } from 'zod';

/**
 * What the person filled on the create screen, kept so closing the app mid-way loses nothing.
 * Pure: storage lives in createDraftStore.ts. Version 1; anything else is dropped.
 */
export const createFormSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  photos: z.array(z.string().min(1)).max(5),
  description: z.string().max(2000),
  kind: z.enum(['rescue_alert', 'lost', 'adoption']),
  species: z.enum(['dog', 'cat', 'other']),
  size: z.enum(['small', 'medium', 'large']),
  sex: z.enum(['male', 'female', 'unknown']),
  name: z.string().max(80),
  age: z.enum(['filhote', 'adulto', 'idoso']).nullable(),
  care: z.object({
    neutered: z.literal(true).optional(),
    vaccinated: z.literal(true).optional(),
    goodWithKids: z.literal(true).optional(),
    goodWithAnimals: z.literal(true).optional(),
  }),
  urgency: z.enum(['low', 'medium', 'high']),
  reference: z.string().max(200),
  point: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
});

export type CreateForm = z.infer<typeof createFormSchema>;

/** Worth keeping only when the person already put something of theirs in it. */
export function worthKeeping(form: Pick<CreateForm, 'photos' | 'description' | 'name'>): boolean {
  return form.photos.length > 0 || form.description.trim() !== '' || form.name.trim() !== '';
}

/** Reads a stored draft; a broken or older one is ignored instead of crashing the screen. */
export function parseCreateForm(raw: string | null): CreateForm | null {
  if (!raw) return null;
  try {
    const parsed = createFormSchema.safeParse(JSON.parse(raw));
    return parsed.success && worthKeeping(parsed.data) ? parsed.data : null;
  } catch {
    // Not JSON: an old or damaged value. Ignoring it is the expected outcome here.
    return null;
  }
}
