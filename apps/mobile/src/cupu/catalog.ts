/**
 * Tipos do Cupu no app. O catálogo e as regras de liberação moram em @patinha/shared e são
 * conferidos no servidor; o app (que não depende do pacote) só repete os códigos que desenha.
 * Sem import de React Native, para rodar no node:test.
 */

export type CupuPose =
  'sit' | 'wave' | 'party' | 'search' | 'home' | 'bowl' | 'map' | 'saved' | 'chat';
export type CupuScene = 'creme' | 'mangueiras' | 'guajara' | 'por_do_sol' | 'noite';
export type CupuAccessory = 'none' | 'fitinhas' | 'estrelas' | 'coracoes' | 'medalha' | 'coroa';
export type CupuSlot = 'pose' | 'scene' | 'accessory';

export interface CupuStyle {
  pose: CupuPose;
  scene: CupuScene;
  accessory: CupuAccessory;
}

export const defaultCupuStyle: CupuStyle = { pose: 'sit', scene: 'creme', accessory: 'none' };

export interface CupuClosetItem {
  slot: CupuSlot;
  code: string;
  name: string;
  unlocked: boolean;
  /** Como liberar, já escrito pelo servidor ("Chegue no nível Guardião local"). */
  requirement: string;
  /** Opcionais: servidores antigos não mandam. */
  requiredLevel?: string | null;
  requiredBadge?: string | null;
}

/** Mesmos pisos de `levelForXp` (@patinha/shared). */
const levels = [
  { code: 'scout', floor: 0 },
  { code: 'local_guardian', floor: 101 },
  { code: 'active_protector', floor: 501 },
  { code: 'guardian_angel', floor: 2001 },
] as const;

function rankOfFloor(floor: number): number {
  let rank = 0;
  levels.forEach((level, index) => {
    if (floor >= level.floor) rank = index;
  });
  return rank;
}

function rankOfCode(code: string): number {
  return levels.findIndex((level) => level.code === code);
}

/** Nomes do que subir do piso `fromFloor` até o `toFloor` liberou no armário. */
export function levelUnlocks(
  items: readonly CupuClosetItem[],
  fromFloor: number,
  toFloor: number,
): string[] {
  const from = rankOfFloor(fromFloor);
  const to = rankOfFloor(toFloor);
  return items
    .filter((item) => {
      if (!item.requiredLevel) return false;
      const rank = rankOfCode(item.requiredLevel);
      return rank > from && rank <= to;
    })
    .map((item) => item.name);
}
