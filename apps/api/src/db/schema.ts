import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: text('firebase_uid').notNull().unique(),
  name: text('name').notNull(),
  handle: text('handle').notNull().unique(),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
  role: text('role').notNull().default('user'),
  verified: boolean('verified').notNull().default(false),
  suspended: boolean('suspended').notNull().default(false),
  city: text('city'),
  alertRadiusKm: integer('alert_radius_km').notNull().default(10),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  quietHoursStart: smallint('quiet_hours_start'),
  quietHoursEnd: smallint('quiet_hours_end'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull(),
  userId: uuid('user_id').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  hidden: boolean('hidden').notNull().default(false),
});

export const verificationRequests = pgTable('verification_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  organizationName: text('organization_name').notNull(),
  note: text('note'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const likes = pgTable(
  'likes',
  {
    userId: uuid('user_id').notNull(),
    postId: uuid('post_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.postId] })],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull(),
    blockedId: uuid('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id').notNull(),
    followedId: uuid('followed_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followedId] })],
);

export const helpRequests = pgTable('help_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull(),
  kind: text('kind').notNull(),
  goalAmount: numeric('goal_amount'),
  pixKey: text('pix_key'),
  deadline: timestamp('deadline', { withTimezone: true }),
});

export const adoptionTerms = pgTable(
  'adoption_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').notNull(),
    userId: uuid('user_id').notNull(),
    body: text('body').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.postId, table.userId)],
);

export const volunteerProfiles = pgTable('volunteer_profiles', {
  userId: uuid('user_id').primaryKey(),
  isTransportAvailable: boolean('is_transport_available').notNull().default(false),
  isFosterAvailable: boolean('is_foster_available').notNull().default(false),
  fosterPetTypes: jsonb('foster_pet_types').notNull().default([]),
  fosterMaxDays: integer('foster_max_days'),
  serviceRadiusKm: integer('service_radius_km').notNull().default(10),
});

export const userXpHistory = pgTable('user_xp_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  actionType: text('action_type').notNull(),
  points: integer('points').notNull(),
  sourceId: text('source_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id').notNull(),
    badgeCode: text('badge_code').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.badgeCode] })],
);
