/**
 * Parceiros do Cupu no app: petshops, clínicas e lojas que aparecem no mapa e nos cartões
 * "Parceiro do bem". Sem import de React Native, para rodar no node:test. O app nunca recebe
 * dinheiro: o parceiro entra de graça oferecendo uma vantagem a quem adota ou resgata.
 */

export type PartnerKind = 'petshop' | 'vet' | 'clinic_24h' | 'feed_store' | 'grooming' | 'other';
export type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'paused';

export interface Partner {
  id: string;
  name: string;
  kind: PartnerKind;
  kindLabel: string;
  about: string | null;
  perk: string;
  hours: string | null;
  addressText: string;
  location: { latitude: number; longitude: number };
  whatsapp: string;
  instagram: string | null;
  featured: boolean;
}

export interface OwnPartner extends Partner {
  status: PartnerStatus;
  paused: boolean;
  reviewNote: string | null;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: { days: number; views: number; whatsappTaps: number; routeTaps: number };
}

export const partnerKinds: PartnerKind[] = [
  'petshop',
  'vet',
  'clinic_24h',
  'feed_store',
  'grooming',
  'other',
];

export const partnerKindLabels: Record<PartnerKind, string> = {
  petshop: 'Petshop',
  vet: 'Veterinário',
  clinic_24h: 'Clínica 24h',
  feed_store: 'Ração e acessórios',
  grooming: 'Banho e tosa',
  other: 'Outro',
};

/** Nomes do Feather (src/components/ui/Icon). */
export const partnerKindIcons: Record<PartnerKind, string> = {
  petshop: 'shopping-bag',
  vet: 'activity',
  clinic_24h: 'plus-square',
  feed_store: 'package',
  grooming: 'scissors',
  other: 'star',
};

export const statusLabels: Record<PartnerStatus, string> = {
  pending: 'Esperando a equipe',
  approved: 'No mapa',
  rejected: 'Não aprovado',
  paused: 'Pausado pela equipe',
};

/** Ideias de vantagem que o formulário oferece com um toque. */
export const perkIdeas = [
  '10% de desconto para quem adotar pelo app',
  'Primeira consulta com desconto para animal resgatado',
  'Banho grátis no primeiro mês do adotado',
  'Ração com desconto para protetores verificados',
];

/** Primeira mensagem do WhatsApp, para o parceiro saber de onde veio o cliente. */
export function partnerGreeting(partner: Pick<Partner, 'name'>): string {
  return `Oi, ${partner.name}! Vi vocês no Égua, adota! como Parceiro do Cupu.`;
}

export function routeUrl(location: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
}

/** Ordem para o mapa: os destaques primeiro, depois o mais perto. */
export function nearestPartners<T extends Pick<Partner, 'location' | 'featured'>>(
  partners: readonly T[],
  here: { latitude: number; longitude: number } | null,
): T[] {
  const distance = (partner: T) =>
    here
      ? (partner.location.latitude - here.latitude) ** 2 +
        (partner.location.longitude - here.longitude) ** 2
      : 0;
  return [...partners].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || distance(a) - distance(b),
  );
}

// Convite "Anuncie aqui": um popup leve com o Cupu na tela do mapa.
export const INVITE_FIRST_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
export const INVITE_REPEAT_MS = 21 * 24 * 60 * 60 * 1000;

export interface InviteMemory {
  /** Quando o app viu esta pessoa pela primeira vez. */
  firstSeenAt: number | null;
  lastShownAt: number | null;
  /** "Não mostrar mais". */
  muted: boolean;
}

/**
 * O convite nunca aparece nos primeiros dias (a pessoa ainda está conhecendo o app), nem para
 * quem já pediu para calar ou já é parceiro, e volta no máximo a cada três semanas.
 */
export function shouldInvite(memory: InviteMemory, now: number, isPartner: boolean): boolean {
  if (memory.muted || isPartner || memory.firstSeenAt === null) return false;
  if (now - memory.firstSeenAt < INVITE_FIRST_DELAY_MS) return false;
  return memory.lastShownAt === null || now - memory.lastShownAt >= INVITE_REPEAT_MS;
}

// Cartão "Parceiro do bem" no feed: depois do 4º resgate e, dali em diante, a cada 12.
const SPOTLIGHT_FIRST = 3;
const SPOTLIGHT_EVERY = 12;

/** Qual destaque vai depois do post nesta posição, ou null quando nenhum vai. */
export function spotlightSlot(index: number): number | null {
  if (index < SPOTLIGHT_FIRST) return null;
  const offset = index - SPOTLIGHT_FIRST;
  return offset % SPOTLIGHT_EVERY === 0 ? offset / SPOTLIGHT_EVERY : null;
}
