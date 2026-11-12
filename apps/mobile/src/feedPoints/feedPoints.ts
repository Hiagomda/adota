/**
 * Pontos solidários no app: potes de ração e de água na rua. Sem import de React Native, para
 * rodar no node:test. Quem cadastra pode cuidar do ponto ou só conhecer; quem passa conta se
 * abasteceu, se está vazio ou se o ponto sumiu.
 */

export type FeedPointKind = 'food' | 'water' | 'both';
export type FeedPointRelation = 'mine' | 'known';
export type FeedPointStatus = 'pending' | 'approved' | 'rejected' | 'removed';
export type FeedPointReport = 'refilled' | 'empty' | 'checked' | 'gone';

export interface FeedPoint {
  id: string;
  kind: FeedPointKind;
  kindLabel: string;
  relation: FeedPointRelation;
  addressText: string;
  note: string | null;
  location: { latitude: number; longitude: number };
  photo: { url: string; thumbUrl: string } | null;
  lastRefilledAt: string | null;
  lastEmptyAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface OwnFeedPoint extends FeedPoint {
  status: FeedPointStatus;
  reviewNote: string | null;
  visible: boolean;
  mine: true;
  updatedAt: string;
}

export const feedPointKinds: FeedPointKind[] = ['both', 'food', 'water'];

export const feedPointKindLabels: Record<FeedPointKind, string> = {
  food: 'Ração',
  water: 'Água',
  both: 'Ração e água',
};

export const feedPointRelationLabels: Record<FeedPointRelation, string> = {
  mine: 'Eu cuido deste ponto',
  known: 'Conheço, mas quem cuida é outra pessoa',
};

/** O que o cartão diz sobre quem cuida. Nunca o nome: o pote pode estar na porta de casa. */
export const feedPointRelationShort: Record<FeedPointRelation, string> = {
  mine: 'Tem alguém cuidando',
  known: 'Indicado pela comunidade',
};

export const feedPointStatusLabels: Record<FeedPointStatus, string> = {
  pending: 'Esperando a equipe',
  approved: 'No mapa',
  rejected: 'Não aprovado',
  removed: 'Fora do mapa',
};

/** Ideias de observação que o formulário oferece com um toque. */
export const noteIdeas = [
  'Abasteço todo dia de manhã',
  'Pote de água ao lado do portão',
  'Os gatos da praça comem aqui à noite',
  'Aceito doação de ração para manter o ponto',
];

export type Freshness = 'refilled' | 'empty' | 'checked' | 'unknown';

/**
 * O que o mapa diz sobre o ponto agora, pelo aviso mais recente de quem passou. "Está vazio"
 * vale até alguém abastecer; abastecido vale por um dia; depois disso, só "conferido".
 */
export function feedPointFreshness(
  point: Pick<FeedPoint, 'lastRefilledAt' | 'lastEmptyAt' | 'lastCheckedAt'>,
  now: number,
): { state: Freshness; at: string | null } {
  const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);
  const refilled = time(point.lastRefilledAt);
  const empty = time(point.lastEmptyAt);
  const checked = time(point.lastCheckedAt);
  const DAY = 24 * 60 * 60 * 1000;
  if (!Number.isNaN(empty) && (Number.isNaN(refilled) || empty > refilled)) {
    return { state: 'empty', at: point.lastEmptyAt };
  }
  if (!Number.isNaN(refilled) && now - refilled < DAY) {
    return { state: 'refilled', at: point.lastRefilledAt };
  }
  const latest = [refilled, checked].filter((value) => !Number.isNaN(value));
  if (latest.length === 0) return { state: 'unknown', at: null };
  const newest = Math.max(...latest);
  return { state: 'checked', at: new Date(newest).toISOString() };
}

export const reportThanks: Record<FeedPointReport, string> = {
  refilled: 'Valeu por abastecer! O mapa já mostra que tem comida e água.',
  empty: 'Obrigado por avisar. Quem cuida do ponto recebe um aviso.',
  checked: 'Obrigado! O ponto continua no mapa.',
  gone: 'Obrigado por avisar. Se mais gente confirmar, o ponto sai do mapa.',
};

/** Mensagem pronta para chamar gente no WhatsApp para ajudar no ponto. */
export function feedPointShareText(point: Pick<FeedPoint, 'kindLabel' | 'addressText'>): string {
  return `Tem um ponto solidário de ${point.kindLabel.toLowerCase()} para os animais em ${point.addressText}. Se passar por lá, dá uma olhada no pote! Vi no Égua, adota!`;
}
