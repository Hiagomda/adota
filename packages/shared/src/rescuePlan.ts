import { z } from 'zod';

/**
 * Plano de ação de um resgate: a lista do que o caso precisa (alguém olhar o local, veterinário,
 * lar temporário, ração, materiais) e se cada coisa já tem quem resolva. A lista sai sozinha do
 * próprio caso; quem publicou e a equipe podem marcar uma necessidade como resolvida, dizer que
 * não precisa ou incluir uma que faltou. O objetivo é que cinco pessoas não ofereçam a mesma
 * coisa enquanto outra, urgente, fica sem ninguém.
 */
export const rescueNeedKindSchema = z.enum(['check_site', 'vet', 'foster', 'food', 'supplies']);
export type RescueNeedKind = z.infer<typeof rescueNeedKindSchema>;

/** O que quem cuida do caso pode marcar. `auto` apaga a marca e volta a valer a regra do caso. */
export const rescueNeedMarkSchema = z.enum(['needed', 'covered', 'dismissed', 'auto']);
export type RescueNeedMark = z.infer<typeof rescueNeedMarkSchema>;
export type StoredRescueNeedMark = Exclude<RescueNeedMark, 'auto'>;

export const rescueNeedMarkBodySchema = z.object({ mark: rescueNeedMarkSchema }).strict();

/**
 * - `open`: precisa e ninguém se ofereceu.
 * - `offered`: alguém ofereceu e espera resposta de quem cuida.
 * - `covered`: já tem quem resolva (oferta aceita, gente a caminho, Casa Amiga aprovada ou marcado).
 * - `dismissed`: quem cuida disse que não precisa.
 */
export type RescueNeedState = 'open' | 'offered' | 'covered' | 'dismissed';

export interface RescuePlanInput {
  status: string;
  urgency: 'low' | 'medium' | 'high';
  /** Observação de saúde do animal: se tem algo escrito, o veterinário entra no plano. */
  healthNotes: string | null;
  /** Quantas pessoas disseram "vou ajudar". */
  goingCount: number;
  /** Ofertas ativas por tipo, separando as aceitas das que esperam resposta. */
  offers: Partial<Record<RescueNeedKind, { offered: number; accepted: number }>>;
  /** Pedido de acolhimento numa Casa Amiga. */
  fosterStay: 'requested' | 'approved' | null;
  marks: Partial<Record<RescueNeedKind, StoredRescueNeedMark>>;
}

export interface RescueNeed {
  kind: RescueNeedKind;
  state: RescueNeedState;
  /** Frase curta que explica o estado, para ninguém achar que a lista é sorteio. */
  detail: string;
  /** true quando a necessidade entrou ou mudou por marca de quem cuida. */
  marked: boolean;
}

const streetStatuses = new Set(['open', 'on_the_way', 'not_found']);
const housedStatuses = new Set(['fostered', 'for_adoption', 'adopted']);

/** Ordem de prioridade: chegar no animal, saúde, onde ficar, comida, o resto. */
export const rescueNeedOrder: readonly RescueNeedKind[] = [
  'check_site',
  'vet',
  'foster',
  'food',
  'supplies',
];

/** Estados em que o plano ainda importa. Depois da adoção ou de voltar para casa ele some. */
export function planApplies(type: string, status: string): boolean {
  return type === 'rescue_alert' && (streetStatuses.has(status) || status === 'rescued');
}

function automatic(kind: RescueNeedKind, input: RescuePlanInput): boolean {
  switch (kind) {
    case 'check_site':
      return streetStatuses.has(input.status);
    case 'vet':
      return input.urgency === 'high' || Boolean(input.healthNotes?.trim());
    case 'foster':
      return !housedStatuses.has(input.status);
    case 'food':
      // Na rua e logo depois do resgate o animal precisa comer; quem cuida tira se já tem.
      return !housedStatuses.has(input.status);
    case 'supplies':
      return false;
  }
}

function fromHelp(
  kind: RescueNeedKind,
  input: RescuePlanInput,
): { state: RescueNeedState; detail: string } {
  if (kind === 'check_site') {
    if (!streetStatuses.has(input.status)) {
      return { state: 'covered', detail: 'O animal já saiu da rua' };
    }
    if (input.goingCount > 0) {
      return {
        state: 'covered',
        detail:
          input.goingCount === 1 ? '1 pessoa a caminho' : `${input.goingCount} pessoas a caminho`,
      };
    }
    return { state: 'open', detail: 'Ninguém a caminho ainda' };
  }
  if (kind === 'foster') {
    if (housedStatuses.has(input.status)) {
      return { state: 'covered', detail: 'Já está num lar' };
    }
    if (input.fosterStay === 'approved') {
      return { state: 'covered', detail: 'Casa Amiga aceitou receber' };
    }
  }
  const offers = input.offers[kind];
  if (offers && offers.accepted > 0) {
    return { state: 'covered', detail: 'Oferta aceita' };
  }
  if (kind === 'foster' && input.fosterStay === 'requested') {
    return { state: 'offered', detail: 'Pedido para uma Casa Amiga esperando resposta' };
  }
  if (offers && offers.offered > 0) {
    return {
      state: 'offered',
      detail:
        offers.offered === 1
          ? '1 oferta esperando resposta'
          : `${offers.offered} ofertas esperando resposta`,
    };
  }
  return { state: 'open', detail: 'Ninguém ofereceu ainda' };
}

/**
 * Monta o plano. Uma marca de "resolvido" ou "não precisa" vale mais que a regra; uma marca de
 * "precisa" inclui o que a regra deixou de fora (veterinário num caso calmo, materiais).
 */
export function rescuePlan(input: RescuePlanInput): RescueNeed[] {
  const needs: RescueNeed[] = [];
  for (const kind of rescueNeedOrder) {
    const mark = input.marks[kind];
    if (mark === 'dismissed') {
      needs.push({
        kind,
        state: 'dismissed',
        detail: 'Quem cuida disse que não precisa',
        marked: true,
      });
      continue;
    }
    if (mark === 'covered') {
      needs.push({
        kind,
        state: 'covered',
        detail: 'Quem cuida marcou como resolvido',
        marked: true,
      });
      continue;
    }
    const help = fromHelp(kind, input);
    const included = mark === 'needed' || automatic(kind, input) || help.state !== 'open';
    if (!included) continue;
    needs.push({ kind, ...help, marked: mark === 'needed' });
  }
  return needs;
}

/** O que ainda está sem ninguém, na ordem de prioridade. */
export function openNeedKinds(needs: readonly RescueNeed[]): RescueNeedKind[] {
  return needs.filter((need) => need.state === 'open').map((need) => need.kind);
}

export const rescueNeedTitle: Record<RescueNeedKind, string> = {
  check_site: 'alguém no local',
  vet: 'veterinário',
  foster: 'lar temporário',
  food: 'ração',
  supplies: 'materiais',
};

/** "Falta veterinário e lar temporário": a razão que a central mostra no caso. */
export function missingReason(kinds: readonly RescueNeedKind[]): string | null {
  const names = kinds.filter((kind) => kind !== 'check_site').map((kind) => rescueNeedTitle[kind]);
  if (names.length === 0) return null;
  if (names.length === 1) return `Falta ${names[0]}`;
  return `Falta ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
