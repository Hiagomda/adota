import {
  badgesForAction,
  levelForXp,
  pointsForVolunteerAction,
  volunteerBadgeCatalog,
  type ClaimVolunteerXpInput,
  type VolunteerSettingsInput,
} from '@patinha/shared';
import type { Pool } from 'pg';
import { HttpError } from './http.js';
import { rowsOf } from './session.js';

interface ProfileRow {
  is_transport_available: boolean;
  is_foster_available: boolean;
  foster_pet_types: string[];
  foster_max_days: number | null;
  service_radius_km: number;
}

interface BadgeRow {
  badge_code: string;
  unlocked_at: Date;
}

const emptySettings = {
  isTransportAvailable: false,
  isFosterAvailable: false,
  fosterPetTypes: [] as string[],
  fosterMaxDays: null as number | null,
  serviceRadiusKm: 10,
};

export async function volunteerStatus(pool: Pool, userId: string) {
  const profile = await pool.query(
    `SELECT is_transport_available, is_foster_available, foster_pet_types, foster_max_days, service_radius_km
     FROM volunteer_profiles WHERE user_id = $1`,
    [userId],
  );
  const xpRow = await pool.query<{ xp: number }>(
    `SELECT COALESCE(SUM(points), 0)::int AS xp FROM user_xp_history WHERE user_id = $1`,
    [userId],
  );
  const badges = await pool.query(
    `SELECT badge_code, unlocked_at FROM user_badges WHERE user_id = $1`,
    [userId],
  );
  const xp = rowsOf<{ xp: number }>(xpRow)[0]?.xp ?? 0;
  return present(rowsOf<ProfileRow>(profile)[0], xp, rowsOf<BadgeRow>(badges));
}

export async function saveVolunteerSettings(
  pool: Pool,
  userId: string,
  input: VolunteerSettingsInput,
) {
  await pool.query(
    `INSERT INTO volunteer_profiles (
       user_id, is_transport_available, is_foster_available, foster_pet_types, foster_max_days, service_radius_km
     ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       is_transport_available = EXCLUDED.is_transport_available,
       is_foster_available = EXCLUDED.is_foster_available,
       foster_pet_types = EXCLUDED.foster_pet_types,
       foster_max_days = EXCLUDED.foster_max_days,
       service_radius_km = EXCLUDED.service_radius_km`,
    [
      userId,
      input.isTransportAvailable,
      input.isFosterAvailable,
      JSON.stringify(input.fosterPetTypes),
      input.fosterMaxDays,
      input.serviceRadiusKm,
    ],
  );
  return volunteerStatus(pool, userId);
}

export async function claimVolunteerXp(pool: Pool, userId: string, input: ClaimVolunteerXpInput) {
  const points = pointsForVolunteerAction(input);
  if (points <= 0) throw new HttpError(400, 'Essa ação não soma pontos.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_xp_history (user_id, action_type, points, source_id) VALUES ($1, $2, $3, $4)`,
      [userId, input.actionType, points, input.sourceId ?? null],
    );
    const xpRow = await client.query<{ xp: number }>(
      `SELECT COALESCE(SUM(points), 0)::int AS xp FROM user_xp_history WHERE user_id = $1`,
      [userId],
    );
    const xp = rowsOf<{ xp: number }>(xpRow)[0]?.xp ?? points;
    for (const code of badgesForAction(input.actionType, xp)) {
      await client.query(
        `INSERT INTO user_badges (user_id, badge_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, code],
      );
    }
    await client.query('COMMIT');
    const status = await volunteerStatus(pool, userId);
    return { pointsAwarded: points, ...status };
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      throw new HttpError(409, 'Essa ação já entrou na sua rede.');
    }
    throw error;
  } finally {
    client.release();
  }
}

function present(profile: ProfileRow | undefined, xp: number, badges: BadgeRow[]) {
  const unlocked = new Map(badges.map((badge) => [badge.badge_code, badge.unlocked_at]));
  return {
    settings: profile
      ? {
          isTransportAvailable: profile.is_transport_available,
          isFosterAvailable: profile.is_foster_available,
          fosterPetTypes: profile.foster_pet_types,
          fosterMaxDays: profile.foster_max_days,
          serviceRadiusKm: profile.service_radius_km,
        }
      : emptySettings,
    xp,
    level: levelForXp(xp),
    badges: volunteerBadgeCatalog.map((badge) => ({
      code: badge.code,
      name: badge.name,
      unlockedAt: iso(unlocked.get(badge.code)),
    })),
  };
}

function iso(value: Date | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
