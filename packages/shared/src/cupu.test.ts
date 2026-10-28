import { describe, expect, it } from 'vitest';
import {
  cupuAccessorySchema,
  cupuCatalog,
  cupuItemUnlocked,
  cupuPoseSchema,
  cupuRequirementLabel,
  cupuSceneSchema,
  cupuStyleSchema,
  defaultCupuStyle,
  findCupuItem,
  lockedCupuItems,
  newlyUnlockedCupuItems,
  resolveCupuStyle,
} from './cupu.js';
import { levelForXp } from './volunteer.js';

const beginner = { level: 'scout', badges: [] } as const;

describe('cupu catalog', () => {
  it('keeps the schemas in step with the catalog', () => {
    const codes = (slot: string) =>
      cupuCatalog.filter((item) => item.slot === slot).map((item) => item.code);
    expect(codes('pose')).toEqual(cupuPoseSchema.options);
    expect(codes('scene')).toEqual(cupuSceneSchema.options);
    expect(codes('accessory')).toEqual(cupuAccessorySchema.options);
  });

  it('has the default style free for everyone', () => {
    for (const [slot, code] of Object.entries(defaultCupuStyle)) {
      const item = findCupuItem(slot as 'pose', code);
      expect(item?.requirement.kind).toBe('free');
    }
  });

  it('unlocks by level, counting the levels above', () => {
    const party = findCupuItem('pose', 'party');
    if (!party) throw new Error('missing party');
    expect(cupuItemUnlocked(party, beginner)).toBe(false);
    expect(cupuItemUnlocked(party, { level: levelForXp(101).code, badges: [] })).toBe(true);
    expect(cupuItemUnlocked(party, { level: 'guardian_angel', badges: [] })).toBe(true);
  });

  it('unlocks by badge', () => {
    const hearts = findCupuItem('accessory', 'coracoes');
    if (!hearts) throw new Error('missing hearts');
    expect(cupuItemUnlocked(hearts, beginner)).toBe(false);
    expect(cupuItemUnlocked(hearts, { level: 'scout', badges: ['open_doors'] })).toBe(true);
  });

  it('lists what is still locked in a style', () => {
    const style = { pose: 'party', scene: 'creme', accessory: 'medalha' } as const;
    expect(lockedCupuItems(style, beginner).map((item) => item.code)).toEqual(['party', 'medalha']);
    expect(lockedCupuItems(defaultCupuStyle, beginner)).toEqual([]);
  });

  it('falls back slot by slot when a saved item is locked or unknown', () => {
    expect(
      resolveCupuStyle({ pose: 'wave', scene: 'noite', accessory: 'sumiu' }, beginner),
    ).toEqual({ pose: 'wave', scene: 'creme', accessory: 'none' });
    expect(resolveCupuStyle(null, beginner)).toEqual(defaultCupuStyle);
  });

  it('tells what a new level unlocks', () => {
    const unlocked = newlyUnlockedCupuItems(beginner, { level: 'local_guardian', badges: [] });
    expect(unlocked.map((item) => item.code)).toEqual(['party', 'mangueiras', 'fitinhas']);
  });

  it('explains requirements in plain words', () => {
    expect(cupuRequirementLabel({ kind: 'level', level: 'active_protector' })).toBe(
      'Chegue no nível Protetor ativo',
    );
    expect(cupuRequirementLabel({ kind: 'badge', badge: 'open_doors' })).toBe(
      'Ganhe o selo Portas abertas',
    );
  });

  it('rejects codes outside the catalog', () => {
    expect(cupuStyleSchema.safeParse({ ...defaultCupuStyle, pose: 'drive' }).success).toBe(false);
    expect(cupuStyleSchema.safeParse(defaultCupuStyle).success).toBe(true);
  });
});
