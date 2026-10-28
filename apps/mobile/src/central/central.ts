/**
 * Central de resgates: tipos da resposta de GET /central e das ofertas de ajuda, rótulos e
 * filtros. Sem import de React Native, para rodar no node:test.
 */

import type { IconName } from '../components/ui/Icon';

export type HelpOfferKind = 'foster' | 'food' | 'vet' | 'supplies' | 'other';
export type HelpOfferStatus = 'offered' | 'accepted' | 'declined' | 'withdrawn';
export type CentralStatus = 'open' | 'on_the_way' | 'not_found' | 'rescued';

export interface CentralCase {
  id: string;
  urgency: 'low' | 'medium' | 'high';
  status: CentralStatus;
  createdAt: string;
  lastActivityAt: string;
  approxLabel: string;
  location: { latitude: number; longitude: number; exact: boolean };
  distanceKm: number | null;
  animal: {
    id: string;
    species: string;
    size: string;
    name: string | null;
    thumbUrl: string | null;
  };
  goingCount: number;
  offerCounts: Record<HelpOfferKind, number>;
  helperCount: number;
  /** Pedido de acolhimento numa Casa Amiga. Ausente em servidores antigos. */
  fosterStay?: 'requested' | 'approved' | null;
  volunteers: { name: string; handle: string; avatarUrl: string | null }[];
  withoutHelp: boolean;
  score: number;
  reasons: string[];
  viewer: { isAuthor: boolean; willHelp: boolean; offers: HelpOfferKind[] };
}

export interface CentralPage {
  serverTime: string;
  refreshSeconds: number;
  summary: { activeCases: number; withoutHelp: number; volunteers: number; urgent: number };
  cases: CentralCase[];
}

export interface HelpOffer {
  id: string;
  kind: HelpOfferKind;
  status: HelpOfferStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  person: { name: string; handle: string; avatarUrl: string | null };
}

export interface HelpOffersPage {
  canDecide: boolean;
  canOffer: boolean;
  offers: HelpOffer[];
}

/** Sem transporte: o app não tem carona nem transporte. */
export const helpOfferKinds: {
  value: HelpOfferKind;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  {
    value: 'foster',
    label: 'Lar temporário',
    hint: 'Posso receber o animal por um tempo',
    icon: 'home',
  },
  { value: 'food', label: 'Ração', hint: 'Posso levar ou mandar ração', icon: 'package' },
  {
    value: 'vet',
    label: 'Veterinário',
    hint: 'Posso pagar ou conseguir consulta',
    icon: 'activity',
  },
  {
    value: 'supplies',
    label: 'Materiais',
    hint: 'Caixa, coleira, cobertor, remédio',
    icon: 'gift',
  },
  { value: 'other', label: 'Outra ajuda', hint: 'Conte como pode ajudar', icon: 'heart' },
];

export function offerKindLabel(kind: string): string {
  return helpOfferKinds.find((item) => item.value === kind)?.label ?? 'Ajuda';
}

export const offerStatusLabel: Record<HelpOfferStatus, string> = {
  offered: 'Esperando resposta',
  accepted: 'Aceita',
  declined: 'Não precisou',
  withdrawn: 'Retirada',
};

export type StatusFilter = 'all' | CentralStatus;
export const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Abertos' },
  { value: 'on_the_way', label: 'A caminho' },
  { value: 'not_found', label: 'Não encontrados' },
  { value: 'rescued', label: 'Resgatados' },
];

export type SpeciesFilter = 'all' | 'dog' | 'cat' | 'other';
export const speciesFilters: { value: SpeciesFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'dog', label: 'Cães' },
  { value: 'cat', label: 'Gatos' },
  { value: 'other', label: 'Outros' },
];

/** 0 é "qualquer distância". */
export const distanceFilters: { value: number; label: string }[] = [
  { value: 0, label: 'Qualquer distância' },
  { value: 2, label: 'Até 2 km' },
  { value: 5, label: 'Até 5 km' },
  { value: 10, label: 'Até 10 km' },
  { value: 25, label: 'Até 25 km' },
];

export interface CentralFilters {
  status: StatusFilter;
  species: SpeciesFilter;
  radiusKm: number;
  withoutHelp: boolean;
}

export const defaultCentralFilters: CentralFilters = {
  status: 'all',
  species: 'all',
  radiusKm: 0,
  withoutHelp: false,
};

/**
 * A busca da central. Sem GPS, a distância não entra (o servidor recusa raio sem ponto) e a
 * lista vem da cidade toda, sem quebrar o filtro.
 */
export function centralPath(
  filters: CentralFilters,
  here: { latitude: number; longitude: number } | null,
): string {
  const params: string[] = [];
  if (here) {
    params.push(`latitude=${here.latitude.toFixed(5)}`, `longitude=${here.longitude.toFixed(5)}`);
    if (filters.radiusKm > 0) params.push(`radiusKm=${filters.radiusKm}`);
  }
  if (filters.species !== 'all') params.push(`species=${filters.species}`);
  if (filters.status !== 'all') params.push(`status=${filters.status}`);
  if (filters.withoutHelp) params.push('withoutHelp=true');
  return params.length > 0 ? `/central?${params.join('&')}` : '/central';
}

/** Quantos filtros mudaram do padrão, para o botão "Limpar". */
export function activeFilterCount(filters: CentralFilters, hasLocation: boolean): number {
  let count = 0;
  if (filters.status !== 'all') count += 1;
  if (filters.species !== 'all') count += 1;
  if (filters.radiusKm > 0 && hasLocation) count += 1;
  if (filters.withoutHelp) count += 1;
  return count;
}

/**
 * Casos com novidade desde a última vez que a pessoa viu a lista: entraram agora ou alguém
 * mexeu (vou ajudar, oferta, diário, avistamento). Na primeira carga nada é novidade.
 */
export function freshCaseIds(
  previous: { serverTime: string; ids: readonly string[] } | null,
  cases: readonly Pick<CentralCase, 'id' | 'lastActivityAt'>[],
): Set<string> {
  const fresh = new Set<string>();
  if (!previous) return fresh;
  const since = Date.parse(previous.serverTime);
  const known = new Set(previous.ids);
  for (const item of cases) {
    if (!known.has(item.id) || Date.parse(item.lastActivityAt) > since) fresh.add(item.id);
  }
  return fresh;
}

/** "2 a caminho · 1 lar · 1 ração" ou "Ninguém ajudando ainda". */
export function helpSummary(
  item: Pick<CentralCase, 'goingCount' | 'offerCounts' | 'fosterStay'>,
): string {
  const parts: string[] = [];
  if (item.fosterStay === 'approved') parts.push('Casa Amiga aceitou');
  else if (item.fosterStay === 'requested') parts.push('Casa Amiga pedida');
  if (item.goingCount > 0) parts.push(`${item.goingCount} a caminho`);
  const short: Record<HelpOfferKind, string> = {
    foster: 'lar',
    food: 'ração',
    vet: 'veterinário',
    supplies: 'materiais',
    other: 'outra ajuda',
  };
  for (const kind of Object.keys(short) as HelpOfferKind[]) {
    const count = item.offerCounts[kind] ?? 0;
    if (count > 0) parts.push(`${count} ${short[kind]}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Ninguém ajudando ainda';
}

/** "a 1,5 km" a partir do valor já arredondado pelo servidor. */
export function caseDistance(distanceKm: number | null): string {
  if (distanceKm === null) return '';
  const text = distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `a ${text} km`;
}

/** Validação da oferta, com a mesma regra do servidor. */
export function offerFormError(kind: HelpOfferKind | null, note: string): string | null {
  if (!kind) return 'Escolha como você pode ajudar.';
  if (note.trim().length > 300) return 'O recado pode ter até 300 letras.';
  if (kind === 'other' && note.trim().length < 3) {
    return 'Conte em poucas palavras como você pode ajudar.';
  }
  return null;
}

/** "14:05" no relógio de Belém (UTC-3, sem horário de verão). */
export function belemClock(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Date(time - 3 * 3_600_000).toISOString().slice(11, 16);
}
