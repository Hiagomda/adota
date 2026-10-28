/**
 * Casa Amiga com vagas: tipos das respostas da API, rótulos e o que cada lado pode fazer num
 * acolhimento. Sem import de React Native, para rodar no node:test. O servidor valida as mesmas
 * regras em @patinha/shared (fosterStayTransition).
 */

export type StayStatus = 'requested' | 'approved' | 'declined' | 'cancelled' | 'ended';
export type StayAction = 'approve' | 'decline' | 'cancel' | 'end';
export type FosterOffer = 'food' | 'supplies' | 'vet';

export interface FosterHomeSettings {
  isFosterAvailable: boolean;
  fosterPetTypes: string[];
  fosterSizes: string[];
  fosterMaxDays: number | null;
  capacity: number;
  acceptsSpecialNeeds: boolean;
  offers: FosterOffer[];
  notes: string | null;
  serviceRadiusKm: number;
}

export interface FosterStay {
  id: string;
  status: StayStatus;
  message: string;
  responseNote: string | null;
  expectedDays: number | null;
  specialCare: boolean;
  createdAt: string;
  decidedAt: string | null;
  endedAt: string | null;
  post: { id: string; approxLabel: string; status: string };
  animal: {
    id: string;
    name: string | null;
    species: string;
    size: string;
    photoUrl: string | null;
  };
  foster: { id: string; name: string; handle: string };
  requester: { id: string; name: string; handle: string } | null;
}

export interface MyFosterHome {
  settings: FosterHomeSettings;
  slots: { capacity: number; occupied: number; free: number };
  hasArea: boolean;
  reachable: boolean;
  received: FosterStay[];
  sent: FosterStay[];
}

export interface FosterOption {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  verified: boolean;
  hasWhatsApp: boolean;
  petTypes: string[];
  sizes: string[];
  maxDays: number | null;
  capacity: number;
  freeSlots: number;
  acceptsSpecialNeeds: boolean;
  offers: FosterOffer[];
  notes: string | null;
  distanceKm: number | null;
  myRequest: { id: string; status: StayStatus } | null;
}

export const offerLabels: Record<FosterOffer, string> = {
  food: 'Ração',
  supplies: 'Materiais (caminha, coleira)',
  vet: 'Ajuda com veterinário',
};

export const sizeChoices = [
  { id: 'small', label: 'Pequeno' },
  { id: 'medium', label: 'Médio' },
  { id: 'large', label: 'Grande' },
] as const;

export const petChoices = [
  { id: 'dog', label: 'Cachorro' },
  { id: 'cat', label: 'Gato' },
  { id: 'other', label: 'Outro' },
] as const;

export const stayStatusLabels: Record<StayStatus, string> = {
  requested: 'Aguardando resposta',
  approved: 'Acolhendo',
  declined: 'Recusado',
  cancelled: 'Cancelado',
  ended: 'Encerrado',
};

export const stayStatusTone: Record<StayStatus, 'warning' | 'success' | 'neutral'> = {
  requested: 'warning',
  approved: 'success',
  declined: 'neutral',
  cancelled: 'neutral',
  ended: 'neutral',
};

/** Botões de um acolhimento para quem olha: a casa responde, quem pediu cancela, os dois encerram. */
export function stayActions(status: StayStatus, side: 'foster' | 'requester'): StayAction[] {
  if (status === 'requested') return side === 'foster' ? ['approve', 'decline'] : ['cancel'];
  if (status === 'approved') return ['end', 'cancel'];
  return [];
}

export const actionLabels: Record<StayAction, string> = {
  approve: 'Aceitar',
  decline: 'Não posso agora',
  cancel: 'Cancelar',
  end: 'Encerrar acolhimento',
};

/** "1 vaga livre de 2", "Sem vaga agora". */
export function slotsLabel(free: number, capacity: number): string {
  if (free <= 0) return 'Sem vaga agora';
  const word = free === 1 ? 'vaga livre' : 'vagas livres';
  return `${free} ${word} de ${capacity}`;
}

/** Uma linha que resume a casa para quem procura: distância, vagas e dias. */
export function optionSummary(
  home: Pick<FosterOption, 'distanceKm' | 'freeSlots' | 'capacity' | 'maxDays'>,
): string {
  const parts: string[] = [];
  if (home.distanceKm !== null) parts.push(`a cerca de ${home.distanceKm} km`);
  parts.push(slotsLabel(home.freeSlots, home.capacity));
  if (home.maxDays) parts.push(`até ${home.maxDays} dias`);
  return parts.join(' · ');
}

/** Liga ou desliga um item de uma lista de escolhas, sem deixar a lista vazia quando `keepOne`. */
export function toggleChoice<T>(list: readonly T[], item: T, keepOne = false): T[] {
  const has = list.includes(item);
  if (has) {
    const next = list.filter((value) => value !== item);
    return keepOne && next.length === 0 ? [...list] : next;
  }
  return [...list, item];
}
