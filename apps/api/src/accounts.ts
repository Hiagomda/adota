import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { updateMeSchema } from '@patinha/shared';
import type { z } from 'zod';
import type { Env } from './config.js';
import { users } from './db/schema.js';
import { HttpError } from './http.js';
import { rowsOf, type SessionUser } from './session.js';

type Database = NodePgDatabase;

type ProfilePatch = z.infer<typeof updateMeSchema>;

/**
 * The owner accounts come from OWNER_EMAILS. Firebase lets anyone sign up with any address,
 * so the address only counts once Firebase has verified it.
 */
export function isOwnerToken(
  env: Pick<Env, 'OWNER_EMAILS'>,
  token: { email?: string; email_verified?: boolean },
): boolean {
  if (token.email_verified !== true || !token.email) return false;
  const email = token.email.trim().toLowerCase();
  const owners = (env.OWNER_EMAILS ?? '').split(',').map((item) => item.trim().toLowerCase());
  return owners.includes(email);
}

/** The installed app treats role `admin` as the team. Do not demote a superadmin. */
export async function grantOwnerRole(pool: Pool, firebaseUid: string): Promise<void> {
  await pool.query(
    `UPDATE users SET role = 'admin'
     WHERE firebase_uid = $1 AND deleted_at IS NULL
       AND role NOT IN ('admin', 'superadmin')`,
    [firebaseUid],
  );
}

export async function findUserByFirebaseUid(
  pool: Pool,
  firebaseUid: string,
): Promise<SessionUser | null> {
  const result = await pool.query(
    `SELECT id, firebase_uid, name, handle, avatar_url, phone, whatsapp_opt_in, role, verified, suspended,
            city, alert_radius_km, notifications_enabled, quiet_hours_start, quiet_hours_end
     FROM users
     WHERE firebase_uid = $1 AND deleted_at IS NULL AND suspended = false`,
    [firebaseUid],
  );
  const row = rowsOf<UserRow>(result)[0];
  return row ? mapUser(row) : null;
}

export async function createDevUser(pool: Pool, email: string): Promise<SessionUser> {
  const handleBase =
    email
      .split('@')[0]
      ?.replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'pessoa';
  const handle = `${handleBase}${Math.floor(Math.random() * 900 + 100)}`;
  const result = await pool.query(
    `INSERT INTO users (firebase_uid, name, handle, city)
     VALUES ($1, $2, $3, 'Belém')
     ON CONFLICT (firebase_uid) DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid
     RETURNING id, firebase_uid, name, handle, avatar_url, phone, whatsapp_opt_in, role, verified, suspended,
               city, alert_radius_km, notifications_enabled, quiet_hours_start, quiet_hours_end`,
    [`dev:${email}`, email.split('@')[0] ?? 'Pessoa', handle],
  );
  const row = rowsOf<UserRow>(result)[0];
  if (!row) throw new HttpError(500, 'Não consegui criar a conta.');
  return mapUser(row);
}

/** First @ for a new Firebase account: the e-mail name plus four characters of the uid. */
export function firstHandle(email: string | undefined, uid: string): string {
  const base =
    (email ?? '')
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 16) || 'pessoa';
  return `${base}${uid
    .slice(0, 4)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '0')}`;
}

/**
 * First sign-in. Another account may already own the derived @ (handles are unique), which used
 * to fail every later request of this person. On that collision, try a random suffix.
 */
export async function createFirebaseUser(
  pool: Pool,
  input: { uid: string; name: string | undefined; email: string | undefined; role: string },
): Promise<void> {
  const first = firstHandle(input.email, input.uid);
  const candidates = [first, ...Array.from({ length: 4 }, () => `${first}${randomDigits()}`)];
  for (const handle of candidates) {
    try {
      await pool.query(
        `INSERT INTO users (firebase_uid, name, handle, city, role) VALUES ($1, $2, $3, 'Belém', $4)
         ON CONFLICT (firebase_uid) DO NOTHING`,
        [input.uid, input.name ?? 'Pessoa', handle, input.role],
      );
      return;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new Error(`No free handle for the new account after ${candidates.length} tries`);
}

function randomDigits(): string {
  return String(Math.floor(Math.random() * 9000 + 1000));
}

export async function profileByHandle(
  db: Database,
  pool: Pool,
  handle: string,
  viewerId: string | null,
) {
  const found = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  const user = found[0];
  if (!user || user.deletedAt) throw new HttpError(404, 'Essa conta não existe.');
  const counts = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM posts WHERE author_id = $1 AND parent_post_id IS NULL AND hidden = false AND review_status = 'published') AS posts,
       (SELECT count(DISTINCT p.animal_id)::int FROM responses r JOIN posts p ON p.id = r.post_id WHERE r.user_id = $1 AND r.kind = 'will_help') AS helped,
       (SELECT count(DISTINCT p.animal_id)::int FROM posts p
          WHERE p.parent_post_id IS NULL AND p.hidden = false
            AND p.status IN ('rescued', 'fostered', 'for_adoption', 'adopted')
            AND p.type IN ('rescue_alert', 'lost')
            AND (p.author_id = $1 OR EXISTS (
              SELECT 1 FROM responses r WHERE r.post_id = p.id AND r.user_id = $1 AND r.kind = 'will_help'
            ))) AS rescued,
       (SELECT count(*)::int FROM follows WHERE followed_id = $1) AS followers,
       (SELECT count(*)::int FROM follows WHERE follower_id = $1 AND follower_id <> followed_id) AS following,
       (SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followed_id = $1)) AS following_me`,
    [user.id, viewerId],
  );
  const countRow = rowsOf<{
    posts: number;
    helped: number;
    rescued: number;
    followers: number;
    following: number;
    following_me: boolean;
  }>(counts)[0];
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    role: user.role,
    verified: user.verified,
    city: user.city,
    counts: {
      posts: countRow?.posts ?? 0,
      helped: countRow?.helped ?? 0,
      // Animals this person found or went for that left the street. Older APKs ignore it.
      rescued: countRow?.rescued ?? 0,
      followers: countRow?.followers ?? 0,
      following: countRow?.following ?? 0,
    },
    following: countRow?.following_me ?? false,
    isMe: viewerId === user.id,
  };
}

export async function updateProfile(
  pool: Pool,
  userId: string,
  patch: ProfilePatch,
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };
  if (patch.name !== undefined) {
    const taken = await pool.query(
      `SELECT 1 FROM users
       WHERE lower(name) = lower($1) AND id <> $2 AND deleted_at IS NULL
       LIMIT 1`,
      [patch.name, userId],
    );
    if ((taken.rowCount ?? 0) > 0) throw new HttpError(409, 'Esse nome já está em uso.');
    set('name', patch.name);
  }
  if (patch.handle !== undefined) set('handle', patch.handle);
  if (patch.phone !== undefined) set('phone', patch.phone);
  if (patch.whatsappOptIn !== undefined) set('whatsapp_opt_in', patch.whatsappOptIn);
  if (patch.city !== undefined) set('city', patch.city);
  if (patch.alertRadiusKm !== undefined) set('alert_radius_km', patch.alertRadiusKm);
  if (patch.avatarUrl !== undefined) set('avatar_url', patch.avatarUrl);
  if (patch.notificationsEnabled !== undefined)
    set('notifications_enabled', patch.notificationsEnabled);
  if (patch.quietHoursStart !== undefined) set('quiet_hours_start', patch.quietHoursStart);
  if (patch.quietHoursEnd !== undefined) set('quiet_hours_end', patch.quietHoursEnd);
  if (patch.latitude !== undefined && patch.longitude !== undefined) {
    params.push(patch.longitude, patch.latitude);
    const lng = params.length - 1;
    const lat = params.length;
    fields.push(`base_location = ST_SetSRID(ST_MakePoint($${lng}, $${lat}), 4326)::geography`);
  }
  if (fields.length === 0) return;
  params.push(userId);
  try {
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
  } catch (error) {
    if (isUnique(error)) throw new HttpError(409, 'Esse @ já está em uso.');
    throw error;
  }
}

/**
 * "Excluir conta" (LGPD). One transaction removes what identifies or locates the person:
 * profile, home location, Casa Amiga, volunteer data, follows, likes, notifications, their
 * rescues and comments (hidden) and the text of their chat messages. The row itself stays,
 * renamed, so other people's rescue history and moderation reports keep their links.
 * Returns the Firebase uid so the caller can also remove the sign-in account.
 */
export async function anonymizeUser(pool: Pool, userId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query<{ firebase_uid: string }>(
      `SELECT firebase_uid FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [userId],
    );
    const firebaseUid = before.rows[0]?.firebase_uid ?? null;
    await client.query(
      `UPDATE users
       SET name = 'Conta excluída',
           handle = $2,
           avatar_url = NULL,
           phone = NULL,
           whatsapp_opt_in = false,
           fcm_tokens = '{}',
           city = NULL,
           base_location = NULL,
           notifications_enabled = false,
           firebase_uid = $3,
           deleted_at = COALESCE(deleted_at, now())
       WHERE id = $1`,
      [userId, `deleted_${userId.replace(/-/g, '')}`, `deleted:${userId}`],
    );
    for (const table of personalTables) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    await client.query(`DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1`, [userId]);
    await client.query(`DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1`, [userId]);
    await client.query(`UPDATE posts SET hidden = true WHERE author_id = $1`, [userId]);
    await client.query(
      `UPDATE comments SET hidden = true, body = 'Comentário apagado.' WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE adoption_messages SET body = 'Mensagem apagada.' WHERE sender_id = $1`,
      [userId],
    );
    await client.query('COMMIT');
    return firebaseUid && !firebaseUid.startsWith('deleted:') ? firebaseUid : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Rows that only describe this person. Fixed names, never user input. */
const personalTables = [
  'fosters',
  'volunteer_profiles',
  'user_xp_history',
  'user_badges',
  'post_follows',
  'sightings',
  'likes',
  'saves',
  'story_views',
  'notifications',
  'adoption_terms',
  'adoption_interests',
  'adoption_events',
  'verification_requests',
  'staff_totp',
  'staff_recovery_codes',
  'admin_sessions',
] as const;

interface UserRow {
  id: string;
  firebase_uid: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  phone: string | null;
  whatsapp_opt_in: boolean;
  role: string;
  verified: boolean;
  suspended: boolean;
  city: string | null;
  alert_radius_km: number;
  notifications_enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
}

export function mapUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    name: row.name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    whatsappOptIn: row.whatsapp_opt_in,
    role: row.role,
    verified: row.verified,
    suspended: row.suspended,
    city: row.city,
    alertRadiusKm: row.alert_radius_km,
    notificationsEnabled: row.notifications_enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
  };
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
