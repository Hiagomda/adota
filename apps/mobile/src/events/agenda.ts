/**
 * Agenda de eventos e mutirões: tipos da API e contas sem React Native, para rodar no
 * node:test. Datas sempre no calendário de Belém (America/Belem, UTC-3 o ano todo).
 */

const BELEM_OFFSET_MS = -3 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

export type EventCategory =
  'adoption_fair' | 'vaccination' | 'neutering' | 'fundraising' | 'community';
export type EventNeed = 'volunteers' | 'food' | 'supplies' | 'vets' | 'space';
export type EventPeriod = 'upcoming' | 'today' | 'week' | 'month' | 'past';
export type EventState = 'cancelled' | 'finished' | 'happening' | 'scheduled';

export interface CommunityEvent {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  placeLabel: string;
  neighborhood: string | null;
  location: { latitude: number; longitude: number };
  distanceKm: number | null;
  startsAt: string;
  endsAt: string;
  state: EventState;
  capacity: number | null;
  registered: number;
  waitlisted: number;
  spotsLeft: number | null;
  needs: EventNeed[];
  needsNote: string | null;
  reviewStatus: 'pending' | 'published' | 'rejected';
  reviewNote: string | null;
  cancelReason: string | null;
  version: number;
  result: {
    summary: string | null;
    adoptions: number | null;
    animalsServed: number | null;
    attended: number;
    recordedAt: string;
  } | null;
  organizer: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    verified: boolean;
    role: string;
  };
  registration: {
    status: 'registered' | 'waitlist';
    position: number | null;
    confirmedAt: string | null;
    checkedInAt: string | null;
  } | null;
  permissions: {
    canManage: boolean;
    canEdit: boolean;
    canCancel: boolean;
    canRecordResult: boolean;
    canRegister: boolean;
  };
}

export interface EventList {
  canCreate: boolean;
  canCreateVerifiedOnly: boolean;
  events: CommunityEvent[];
  nextCursor: string | null;
}

export interface EventHistoryItem {
  kind:
    | 'created'
    | 'updated'
    | 'cancelled'
    | 'approved'
    | 'rejected'
    | 'hidden'
    | 'unhidden'
    | 'result';
  fields: string[];
  reason: string | null;
  at: string;
}

export interface EventDetail {
  event: CommunityEvent;
  history: EventHistoryItem[];
}

export interface EventParticipant {
  person: { id: string; name: string; handle: string; avatarUrl: string | null; verified: boolean };
  status: 'registered' | 'waitlist';
  note: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  registeredAt: string;
}

export const categoryLabels: Record<EventCategory, string> = {
  adoption_fair: 'Feira de adoção',
  vaccination: 'Vacinação',
  neutering: 'Castração',
  fundraising: 'Arrecadação',
  community: 'Ação comunitária',
};

/** Nomes de ícones do Feather (o único conjunto do app). */
export const categoryIcons: Record<EventCategory, string> = {
  adoption_fair: 'heart',
  vaccination: 'shield',
  neutering: 'scissors',
  fundraising: 'gift',
  community: 'users',
};

export const categories = Object.keys(categoryLabels) as EventCategory[];

/** Só perfil verificado (ONG ou protetor) marca estas; a API confere de novo. */
export const verifiedOnly: readonly EventCategory[] = ['adoption_fair', 'fundraising'];

export const needLabels: Record<EventNeed, string> = {
  volunteers: 'Voluntários',
  food: 'Ração',
  supplies: 'Materiais',
  vets: 'Veterinários',
  space: 'Espaço',
};

export const needs = Object.keys(needLabels) as EventNeed[];

export const periodLabels: Record<EventPeriod, string> = {
  upcoming: 'Próximos',
  today: 'Hoje',
  week: '7 dias',
  month: '30 dias',
  past: 'Já aconteceram',
};

export const historyLabels: Record<EventHistoryItem['kind'], string> = {
  created: 'Evento criado',
  updated: 'Evento alterado',
  cancelled: 'Evento cancelado',
  approved: 'Aprovado pela equipe',
  rejected: 'Recusado pela equipe',
  hidden: 'Escondido pela equipe',
  unhidden: 'Voltou para a agenda',
  result: 'Resultado registrado',
};

const fieldLabels: Record<string, string> = {
  title: 'nome',
  description: 'descrição',
  category: 'tipo',
  placeLabel: 'lugar',
  location: 'ponto no mapa',
  startsAt: 'horário',
  endsAt: 'horário',
  capacity: 'vagas',
  needs: 'necessidades',
  needsNote: 'necessidades',
};

/** "Mudou: horário e lugar" a partir dos campos que a API diz que mudaram. */
export function changedFields(fields: string[]): string | null {
  const labels = [...new Set(fields.map((field) => fieldLabels[field]).filter(Boolean))];
  if (labels.length === 0) return null;
  if (labels.length === 1) return `Mudou: ${labels[0]}`;
  return `Mudou: ${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

export interface EventFilters {
  category?: EventCategory | null;
  period?: EventPeriod;
  month?: string | null;
  neighborhood?: string | null;
  near?: { latitude: number; longitude: number; radiusKm: number } | null;
  mine?: 'organizing' | 'registered' | null;
  cursor?: string | null;
}

/** Caminho de /events com os filtros escolhidos, sem parâmetro vazio. */
export function eventsPath(filters: EventFilters): string {
  const params: string[] = [];
  const add = (key: string, value: string | number) =>
    params.push(`${key}=${encodeURIComponent(String(value))}`);
  if (filters.category) add('category', filters.category);
  if (filters.month) add('month', filters.month);
  else if (filters.period && filters.period !== 'upcoming') add('period', filters.period);
  if (filters.neighborhood) add('neighborhood', filters.neighborhood);
  if (filters.near) {
    add('latitude', filters.near.latitude.toFixed(5));
    add('longitude', filters.near.longitude.toFixed(5));
    add('radiusKm', filters.near.radiusKm);
  }
  if (filters.mine) add('mine', filters.mine);
  if (filters.cursor) add('cursor', filters.cursor);
  return params.length > 0 ? `/events?${params.join('&')}` : '/events';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** AAAA-MM-DD do dia em Belém em que o instante cai. */
export function belemDayKey(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  const local = new Date(date.getTime() + BELEM_OFFSET_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

export function belemMonthKey(instant: Date = new Date()): string {
  return belemDayKey(instant).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

const monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const name = monthNames[monthIndex - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

export interface CalendarDay {
  key: string;
  day: number;
  inMonth: boolean;
}

/** Semanas do mês (domingo a sábado), com os dias de fora para completar as pontas. */
export function monthGrid(month: string): CalendarDay[][] {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const weeks: CalendarDay[][] = [];
  let cursor = start;
  do {
    const week: CalendarDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      week.push({
        key: `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`,
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === monthIndex - 1,
      });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }
    weeks.push(week);
  } while (cursor.getUTCMonth() === monthIndex - 1);
  return weeks;
}

/** Eventos agrupados pelo dia de Belém em que começam. */
export function eventsByDay<T extends { startsAt: string }>(events: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const event of events) {
    const key = belemDayKey(event.startsAt);
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return days;
}

/** "3 vagas", "Lotado · 2 na fila" ou "Inscrição livre". */
export function spotsLabel(
  event: Pick<CommunityEvent, 'capacity' | 'spotsLeft' | 'waitlisted' | 'registered'>,
): string {
  if (event.capacity === null) {
    return event.registered > 0
      ? `Inscrição livre · ${event.registered} inscritos`
      : 'Inscrição livre';
  }
  if ((event.spotsLeft ?? 0) > 0) {
    return event.spotsLeft === 1 ? 'Última vaga' : `${event.spotsLeft} vagas`;
  }
  return event.waitlisted > 0 ? `Lotado · ${event.waitlisted} na fila` : 'Lotado · entre na fila';
}

export function stateLabel(event: Pick<CommunityEvent, 'state' | 'reviewStatus'>): string | null {
  if (event.reviewStatus === 'pending') return 'Esperando a equipe';
  if (event.reviewStatus === 'rejected') return 'Não aprovado';
  if (event.state === 'cancelled') return 'Cancelado';
  if (event.state === 'finished') return 'Já aconteceu';
  if (event.state === 'happening') return 'Acontecendo agora';
  return null;
}

export function registrationLabel(registration: CommunityEvent['registration']): string | null {
  if (!registration) return null;
  if (registration.status === 'waitlist') {
    return registration.position
      ? `Você é o ${registration.position}º da fila`
      : 'Na fila de espera';
  }
  if (registration.checkedInAt) return 'Presença marcada';
  return registration.confirmedAt ? 'Presença confirmada' : 'Você está inscrito';
}

/** Texto para mandar no WhatsApp: o que é, quando e onde. Sem dado de quem se inscreveu. */
export function shareText(
  event: Pick<CommunityEvent, 'title' | 'category' | 'placeLabel'>,
  when: string,
): string {
  return `${categoryLabels[event.category]}: ${event.title}\n${when}\n${event.placeLabel}\n\nVeja na agenda do Égua, adota!`;
}

/** Chave contra envio duplo: o mesmo cadastro reenviado não vira dois eventos. */
export function newClientKey(random: () => number = Math.random): string {
  return Array.from({ length: 20 }, () => Math.floor(random() * 36).toString(36)).join('');
}

/** Dias para escolher no cadastro, de hoje em diante, no calendário de Belém. */
export function upcomingDays(
  count: number,
  now: Date = new Date(),
): { key: string; label: string }[] {
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return Array.from({ length: count }, (_, index) => {
    const local = new Date(now.getTime() + BELEM_OFFSET_MS + index * DAY_MS);
    const label =
      index === 0
        ? 'Hoje'
        : `${weekdays[local.getUTCDay()]} ${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}`;
    return {
      key: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
      label,
    };
  });
}

/** Quem organiza marca presença de uma hora antes do começo em diante. */
export function checkInOpen(
  event: Pick<CommunityEvent, 'state' | 'startsAt'>,
  now: Date = new Date(),
): boolean {
  if (event.state === 'happening' || event.state === 'finished') return true;
  return event.state === 'scheduled' && Date.parse(event.startsAt) - now.getTime() <= 3_600_000;
}
