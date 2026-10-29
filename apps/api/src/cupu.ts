import {
  cupuCatalog,
  cupuItemUnlocked,
  cupuRequirementLabel,
  levelForXp,
  lockedCupuItems,
  resolveCupuStyle,
  type CupuProgress,
  type CupuStyle,
} from '@patinha/shared';
import type { Pool } from 'pg';
import { HttpError } from './http.js';
import { rowsOf } from './session.js';

interface StyleRow {
  pose: string;
  scene: string;
  accessory: string;
}

async function progressOf(pool: Pool, userId: string): Promise<CupuProgress> {
  const [xpRow, badges] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(points), 0)::int AS xp FROM user_xp_history WHERE user_id = $1`,
      [userId],
    ),
    pool.query(`SELECT badge_code FROM user_badges WHERE user_id = $1`, [userId]),
  ]);
  const xp = rowsOf<{ xp: number }>(xpRow)[0]?.xp ?? 0;
  return {
    level: levelForXp(xp).code,
    badges: rowsOf<{ badge_code: string }>(badges).map((row) => row.badge_code),
  };
}

/** O Cupu da pessoa e o armário inteiro, com o que já está liberado e como liberar o resto. */
export async function cupuStatus(pool: Pool, userId: string) {
  const [progress, saved] = await Promise.all([
    progressOf(pool, userId),
    pool.query(`SELECT pose, scene, accessory FROM cupu_styles WHERE user_id = $1`, [userId]),
  ]);
  return present(rowsOf<StyleRow>(saved)[0] ?? null, progress);
}

export async function saveCupuStyle(pool: Pool, userId: string, style: CupuStyle) {
  const progress = await progressOf(pool, userId);
  const [locked] = lockedCupuItems(style, progress);
  if (locked) {
    throw new HttpError(
      403,
      `${locked.name} ainda está bloqueado. ${cupuRequirementLabel(locked.requirement)}.`,
    );
  }
  const saved = await pool.query(
    `INSERT INTO cupu_styles (user_id, pose, scene, accessory) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       pose = EXCLUDED.pose,
       scene = EXCLUDED.scene,
       accessory = EXCLUDED.accessory,
       updated_at = now()
     RETURNING pose, scene, accessory`,
    [userId, style.pose, style.scene, style.accessory],
  );
  return present(rowsOf<StyleRow>(saved)[0] ?? null, progress);
}

function present(saved: StyleRow | null, progress: CupuProgress) {
  return {
    style: resolveCupuStyle(saved, progress),
    level: progress.level,
    items: cupuCatalog.map((item) => ({
      slot: item.slot,
      code: item.code,
      name: item.name,
      unlocked: cupuItemUnlocked(item, progress),
      requirement: cupuRequirementLabel(item.requirement),
      requiredLevel: item.requirement.kind === 'level' ? item.requirement.level : null,
      requiredBadge: item.requirement.kind === 'badge' ? item.requirement.badge : null,
    })),
  };
}
