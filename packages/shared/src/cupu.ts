import { z } from 'zod';
import {
  volunteerBadgeCatalog,
  type VolunteerBadgeCode,
  type VolunteerLevelCode,
} from './volunteer.js';

/**
 * O que dá para mudar no Cupu (Cupuaçu, o mascote): a pose, o cenário atrás dele e um enfeite em
 * volta. Tudo é liberado pelo XP, pelo nível e pelos selos que a pessoa já tem. O servidor confere
 * antes de salvar; o app só mostra.
 */

export const cupuSlots = ['pose', 'scene', 'accessory'] as const;
export type CupuSlot = (typeof cupuSlots)[number];

export const cupuLevelOrder: readonly VolunteerLevelCode[] = [
  'scout',
  'local_guardian',
  'active_protector',
  'guardian_angel',
];

const levelNames: Record<VolunteerLevelCode, string> = {
  scout: 'Olheiro',
  local_guardian: 'Guardião local',
  active_protector: 'Protetor ativo',
  guardian_angel: 'Anjo da guarda',
};

export type CupuRequirement =
  | { kind: 'free' }
  | { kind: 'level'; level: VolunteerLevelCode }
  | { kind: 'badge'; badge: VolunteerBadgeCode };

export interface CupuItem {
  slot: CupuSlot;
  code: string;
  name: string;
  requirement: CupuRequirement;
}

const free = { kind: 'free' } as const;
const level = (code: VolunteerLevelCode) => ({ kind: 'level', level: code }) as const;
const badge = (code: VolunteerBadgeCode) => ({ kind: 'badge', badge: code }) as const;

/** As poses usam as ilustrações que já existem em apps/mobile/assets/mascot. */
export const cupuCatalog = [
  { slot: 'pose', code: 'sit', name: 'Sentadinho', requirement: free },
  { slot: 'pose', code: 'wave', name: 'Dando oi', requirement: free },
  { slot: 'pose', code: 'party', name: 'Festeiro', requirement: level('local_guardian') },
  { slot: 'pose', code: 'search', name: 'Detetive', requirement: badge('neighborhood_scout') },
  { slot: 'pose', code: 'home', name: 'Em casa', requirement: badge('open_doors') },
  { slot: 'pose', code: 'bowl', name: 'Hora do rango', requirement: badge('top_sponsor') },
  { slot: 'pose', code: 'map', name: 'Explorador', requirement: badge('local_hero') },
  { slot: 'pose', code: 'saved', name: 'Guardião', requirement: level('active_protector') },
  { slot: 'pose', code: 'chat', name: 'Papo bom', requirement: level('guardian_angel') },

  { slot: 'scene', code: 'creme', name: 'Casinha', requirement: free },
  { slot: 'scene', code: 'mangueiras', name: 'Mangueiras', requirement: level('local_guardian') },
  { slot: 'scene', code: 'guajara', name: 'Baía do Guajará', requirement: badge('local_hero') },
  { slot: 'scene', code: 'por_do_sol', name: 'Pôr do sol', requirement: level('active_protector') },
  { slot: 'scene', code: 'noite', name: 'Noite estrelada', requirement: level('guardian_angel') },

  { slot: 'accessory', code: 'none', name: 'Sem enfeite', requirement: free },
  {
    slot: 'accessory',
    code: 'fitinhas',
    name: 'Fitinhas do Círio',
    requirement: level('local_guardian'),
  },
  {
    slot: 'accessory',
    code: 'estrelas',
    name: 'Estrelinhas',
    requirement: badge('neighborhood_scout'),
  },
  { slot: 'accessory', code: 'coracoes', name: 'Corações', requirement: badge('open_doors') },
  { slot: 'accessory', code: 'medalha', name: 'Medalha', requirement: badge('top_sponsor') },
  {
    slot: 'accessory',
    code: 'coroa',
    name: 'Coroa de folhas',
    requirement: level('guardian_angel'),
  },
] as const satisfies readonly CupuItem[];

export type CupuCatalogItem = (typeof cupuCatalog)[number];

// Listas fixas para o Zod; o teste confere que batem com o catálogo.
export const cupuPoseSchema = z.enum([
  'sit',
  'wave',
  'party',
  'search',
  'home',
  'bowl',
  'map',
  'saved',
  'chat',
]);
export const cupuSceneSchema = z.enum(['creme', 'mangueiras', 'guajara', 'por_do_sol', 'noite']);
export const cupuAccessorySchema = z.enum([
  'none',
  'fitinhas',
  'estrelas',
  'coracoes',
  'medalha',
  'coroa',
]);

export const cupuStyleSchema = z.object({
  pose: cupuPoseSchema,
  scene: cupuSceneSchema,
  accessory: cupuAccessorySchema,
});

export type CupuPoseCode = z.infer<typeof cupuPoseSchema>;
export type CupuSceneCode = z.infer<typeof cupuSceneSchema>;
export type CupuAccessoryCode = z.infer<typeof cupuAccessorySchema>;
export type CupuStyle = z.infer<typeof cupuStyleSchema>;

export const defaultCupuStyle: CupuStyle = { pose: 'sit', scene: 'creme', accessory: 'none' };

export interface CupuProgress {
  level: VolunteerLevelCode;
  badges: readonly string[];
}

export function cupuItemUnlocked(item: CupuItem, progress: CupuProgress): boolean {
  const requirement = item.requirement;
  if (requirement.kind === 'free') return true;
  if (requirement.kind === 'badge') return progress.badges.includes(requirement.badge);
  return cupuLevelOrder.indexOf(progress.level) >= cupuLevelOrder.indexOf(requirement.level);
}

/** Como a pessoa libera o item, dito do jeito que aparece no armário do Cupu. */
export function cupuRequirementLabel(requirement: CupuRequirement): string {
  if (requirement.kind === 'free') return 'Liberado para todo mundo';
  if (requirement.kind === 'level') return `Chegue no nível ${levelNames[requirement.level]}`;
  const name =
    volunteerBadgeCatalog.find((entry) => entry.code === requirement.badge)?.name ??
    requirement.badge;
  return `Ganhe o selo ${name}`;
}

export function findCupuItem(slot: CupuSlot, code: string): CupuCatalogItem | undefined {
  return cupuCatalog.find((item) => item.slot === slot && item.code === code);
}

/** Itens do estilo que a pessoa ainda não liberou. Vazio quando pode salvar. */
export function lockedCupuItems(style: CupuStyle, progress: CupuProgress): CupuCatalogItem[] {
  return cupuSlots
    .map((slot) => findCupuItem(slot, style[slot]))
    .filter((item): item is CupuCatalogItem => item !== undefined)
    .filter((item) => !cupuItemUnlocked(item, progress));
}

/**
 * O estilo que vale agora. Um item salvo que saiu do catálogo ou deixou de estar liberado (por
 * exemplo, XP removido pela equipe) volta para o padrão daquela parte, sem apagar o resto.
 */
export function resolveCupuStyle(
  saved: Partial<Record<CupuSlot, string>> | null | undefined,
  progress: CupuProgress,
): CupuStyle {
  const pick = <S extends CupuSlot>(slot: S): CupuStyle[S] => {
    const item = saved?.[slot] ? findCupuItem(slot, saved[slot]) : undefined;
    return (
      item && cupuItemUnlocked(item, progress) ? item.code : defaultCupuStyle[slot]
    ) as CupuStyle[S];
  };
  return { pose: pick('pose'), scene: pick('scene'), accessory: pick('accessory') };
}

/** Itens liberados por um progresso e ainda não pelo outro: o que comemorar ao subir. */
export function newlyUnlockedCupuItems(
  before: CupuProgress,
  after: CupuProgress,
): CupuCatalogItem[] {
  return cupuCatalog.filter(
    (item) => cupuItemUnlocked(item, after) && !cupuItemUnlocked(item, before),
  );
}

export function cupuLevelName(code: VolunteerLevelCode): string {
  return levelNames[code];
}
