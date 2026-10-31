/**
 * Painel da ONG: tipos da rota `/me/ngo-panel` e as contas da tela. Sem React Native, para o
 * node:test.
 */
import type { Tone } from '../components/ui/tones';
import type { AdoptionAnswers } from '../post/adoptionInterest';
import type { Post } from '../types';

export type NgoAccent = 'turquoise' | 'coral' | 'caramel' | 'green' | 'blue';

export interface PanelAnimal {
  post: Post;
  interests: number;
  newInterests: number;
}

export interface PanelInterest {
  postId: string;
  animal: { name: string | null; species: string; photoUrl: string | null };
  person: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    verified: boolean;
  };
  answers: AdoptionAnswers;
  note: string | null;
  updatedAt: string;
}

export interface NgoPanel {
  org: {
    name: string;
    handle: string;
    avatarUrl: string | null;
    role: string;
    instagram: string | null;
    neighborhood: string | null;
  };
  theme: { accent: NgoAccent; tagline: string | null };
  stats: {
    rescue: number;
    care: number;
    forAdoption: number;
    adoptedTotal: number;
    adoptedThisMonth: number;
    newInterests: number;
  };
  animals: PanelAnimal[];
  recentInterests: PanelInterest[];
}

/** As cores do painel são as do app: cada uma vira um tom com contraste já conferido. */
export const accents: { value: NgoAccent; label: string; tone: Tone }[] = [
  { value: 'turquoise', label: 'Turquesa', tone: 'primary' },
  { value: 'coral', label: 'Coral', tone: 'secondary' },
  { value: 'caramel', label: 'Caramelo', tone: 'caramel' },
  { value: 'green', label: 'Verde mangueira', tone: 'success' },
  { value: 'blue', label: 'Azul do rio', tone: 'info' },
];

export function accentTone(accent: string | null | undefined): Tone {
  return accents.find((option) => option.value === accent)?.tone ?? 'primary';
}

export const TAGLINE_MAX = 120;

export type AnimalGroup = 'adoption' | 'care' | 'adopted';

/** Em que aba do painel o animal aparece, pelo status atual. */
export function animalGroup(status: string): AnimalGroup {
  if (status === 'for_adoption') return 'adoption';
  if (status === 'adopted') return 'adopted';
  return 'care';
}

/**
 * Animais da aba, na ordem em que a ONG age: para adoção, quem tem ficha nova primeiro e depois
 * quem espera há mais tempo; nas outras abas, a ordem da API (mais novo primeiro).
 */
export function animalsOf(animals: PanelAnimal[], group: AnimalGroup): PanelAnimal[] {
  const inGroup = animals.filter((item) => animalGroup(item.post.status) === group);
  if (group !== 'adoption') return inGroup;
  return [...inGroup].sort((a, b) => {
    if (a.newInterests !== b.newInterests) return b.newInterests - a.newInterests;
    return sinceOf(a) - sinceOf(b);
  });
}

function sinceOf(item: PanelAnimal): number {
  const since = Date.parse(item.post.adoptionSince ?? item.post.createdAt);
  return Number.isNaN(since) ? Number.MAX_SAFE_INTEGER : since;
}

/** Média de dias que os animais para adoção esperam, ou null quando não há nenhum. */
export function averageWaitDays(animals: PanelAnimal[], now: Date = new Date()): number | null {
  const waiting = animals.filter((item) => item.post.status === 'for_adoption');
  if (waiting.length === 0) return null;
  const total = waiting.reduce((sum, item) => {
    const since = sinceOf(item);
    if (since === Number.MAX_SAFE_INTEGER) return sum;
    return sum + Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
  }, 0);
  return Math.round(total / waiting.length);
}

/** "12 dias", "3 sem", "2 meses": cabe no quadradinho do número. */
export function waitShort(days: number | null): string {
  if (days === null) return '–';
  if (days < 14) return days === 1 ? '1 dia' : `${days} dias`;
  if (days < 60) return `${Math.floor(days / 7)} sem`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 mês' : `${months} meses`;
}

/** "1 ficha", "3 fichas · 1 nova". Vazio quando ninguém mandou ficha. */
export function interestLabel(total: number, fresh: number): string | null {
  if (total === 0) return null;
  const base = total === 1 ? '1 ficha' : `${total} fichas`;
  if (fresh === 0) return base;
  return `${base} · ${fresh === 1 ? '1 nova' : `${fresh} novas`}`;
}

/** Bom dia, boa tarde ou boa noite no relógio de Belém (UTC-3, sem horário de verão). */
export function greeting(now: Date = new Date()): string {
  const hour = (now.getUTCHours() + 21) % 24;
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
