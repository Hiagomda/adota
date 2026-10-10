import { z } from 'zod';
import { reportError } from './crash/reporter';
import type { Account, AppNotification, Post } from './types';

// Shapes the screens render. Typed as ZodType<T> so a drift between a schema and its interface in
// types.ts is a compile error. The schemas are strict on purpose: a field the API stops sending is
// a bug to fix on one side, so it is reported, not silently defaulted.

/** Output type T, any input: lets a schema reshape (transform) what the API sent. */
export type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

const nullableString = z.string().nullable();
const isoDate = z.string().min(1);

const postMedia = z
  .object({
    url: z.string().min(1),
    thumbUrl: z.string().min(1).nullish(),
  })
  // A row without a thumbnail still shows the full picture.
  .transform((media) => ({ url: media.url, thumbUrl: media.thumbUrl ?? media.url }));

export const postSchema: Schema<Post> = z.object({
  id: z.string().min(1),
  type: z.string(),
  urgency: z.enum(['low', 'medium', 'high']),
  description: z.string(),
  approxLabel: z.string(),
  status: z.string(),
  createdAt: isoDate,
  boosted: z.boolean(),
  author: z.object({
    id: z.string().min(1),
    name: z.string(),
    handle: z.string(),
    avatarUrl: nullableString,
    role: z.string(),
    verified: z.boolean(),
    phone: nullableString,
  }),
  animal: z.object({
    id: z.string().min(1),
    species: z.string(),
    size: z.string(),
    sex: z.string(),
    ageEstimate: nullableString,
    healthNotes: nullableString,
    temperament: nullableString,
  }),
  location: z.object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    exact: z.boolean(),
  }),
  accuracyM: z.number().nullable(),
  addressText: nullableString,
  referencePoint: nullableString,
  media: z.array(postMedia),
  counts: z.object({
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
  }),
  liked: z.boolean(),
  saved: z.boolean(),
  viewerWillHelp: z.boolean(),
  helpRequest: z
    .object({
      kind: z.string(),
      goalAmount: nullableString,
      pixKey: nullableString,
      deadline: nullableString,
      paymentNotice: z.string(),
    })
    .nullable(),
  // Only the single-post endpoint sends the diary.
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string(),
        status: z.string().optional(),
        createdAt: isoDate,
        author: z.object({ name: z.string(), handle: z.string() }),
      }),
    )
    .optional(),
});

export const accountSchema: Schema<Account> = z.object({
  id: z.string().min(1),
  name: z.string(),
  handle: z.string(),
  avatarUrl: nullableString,
  role: z.string(),
  verified: z.boolean(),
  city: nullableString,
  alertRadiusKm: z.number(),
  notificationsEnabled: z.boolean(),
  quietHoursStart: z.number().nullable(),
  quietHoursEnd: z.number().nullable(),
  whatsappOptIn: z.boolean(),
});

export const notificationSchema: Schema<AppNotification> = z.object({
  id: z.string().min(1),
  type: z.string(),
  payload: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    postId: z.string().optional(),
  }),
  readAt: nullableString,
  createdAt: isoDate,
});

export const feedPageSchema = z.object({
  posts: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
});

export const notificationsPageSchema = z.object({ notifications: z.array(z.unknown()) });

export const loginSchema = z.object({ token: z.string().min(1), user: accountSchema });

/**
 * Parses each item on its own. Items the app cannot render are dropped so one bad row does not
 * blank the whole list, and the drop is reported with the failing paths so it gets fixed.
 */
export function parseList<T>(schema: Schema<T>, items: unknown[], where: string): T[] {
  const valid: T[] = [];
  const problems: string[] = [];
  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) valid.push(result.data);
    else problems.push(`#${index}: ${issueSummary(result.error)}`);
  });
  if (problems.length > 0) {
    reportError(new Error(`Dropped ${problems.length} of ${items.length} items from ${where}`), {
      source: 'handled',
      where,
      extra: { problems: problems.slice(0, 10) },
    });
  }
  return valid;
}

export function issueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
    .join('; ');
}
