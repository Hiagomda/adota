/**
 * Feiras de adoção: datas no horário de Belém (UTC-3, sem horário de verão), escolhidas por
 * chips em vez de um seletor de data nativo. Sem React Native, para rodar no node:test.
 */

const BELEM_OFFSET_HOURS = -3;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface AdoptionFair {
  id: string;
  title: string;
  description: string | null;
  placeLabel: string;
  location: { latitude: number; longitude: number };
  startsAt: string;
  endsAt: string;
  organizer: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    verified: boolean;
    role: string;
  };
  mine: boolean;
  canRemove: boolean;
}

export interface FairDay {
  /** AAAA-MM-DD no calendário de Belém. */
  key: string;
  label: string;
}

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const weekdaysLong = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const fairStartHours = [8, 9, 10, 14, 15, 16, 18];
export const fairDurations = [2, 3, 4, 6];

/** O relógio de Belém, lido pelos getters UTC. */
function belem(date: Date): Date {
  return new Date(date.getTime() + BELEM_OFFSET_HOURS * HOUR_MS);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function dayKey(local: Date): string {
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** Os próximos dias para escolher, a partir de amanhã: feira se divulga com antecedência. */
export function fairDays(now: Date = new Date(), count = 21): FairDay[] {
  const today = belem(now);
  return Array.from({ length: count }, (_, index) => {
    const local = new Date(today.getTime() + (index + 1) * DAY_MS);
    return {
      key: dayKey(local),
      label: `${weekdays[local.getUTCDay()]} ${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}`,
    };
  });
}

/** Início e fim em ISO com o fuso de Belém, prontos para a API. */
export function fairRange(day: string, startHour: number, hours: number) {
  const startsAt = `${day}T${pad(startHour)}:00:00-03:00`;
  const end = new Date(Date.parse(startsAt) + hours * HOUR_MS);
  const local = belem(end);
  const endsAt = `${dayKey(local)}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00-03:00`;
  return { startsAt, endsAt };
}

function hourLabel(local: Date): string {
  const minutes = local.getUTCMinutes();
  return minutes === 0 ? `${local.getUTCHours()}h` : `${local.getUTCHours()}h${pad(minutes)}`;
}

/** "Hoje · 9h às 13h", "Acontecendo agora · até 13h" ou "Sábado, 25 out · 9h às 13h". */
export function fairWhen(startsAt: string, endsAt: string, now: Date = new Date()): string {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  const localStart = belem(starts);
  const localEnd = belem(ends);
  if (starts.getTime() <= now.getTime() && ends.getTime() > now.getTime()) {
    return `Acontecendo agora · até ${hourLabel(localEnd)}`;
  }
  const hours = `${hourLabel(localStart)} às ${hourLabel(localEnd)}`;
  const today = dayKey(belem(now));
  const tomorrow = dayKey(new Date(belem(now).getTime() + DAY_MS));
  const key = dayKey(localStart);
  if (key === today) return `Hoje · ${hours}`;
  if (key === tomorrow) return `Amanhã · ${hours}`;
  return `${weekdaysLong[localStart.getUTCDay()]}, ${localStart.getUTCDate()} ${months[localStart.getUTCMonth()]} · ${hours}`;
}

export function happeningNow(fair: AdoptionFair, now: Date = new Date()): boolean {
  return Date.parse(fair.startsAt) <= now.getTime() && Date.parse(fair.endsAt) > now.getTime();
}

/** Abre o lugar no app de mapas do celular. */
export function directionsUrl(location: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
}
