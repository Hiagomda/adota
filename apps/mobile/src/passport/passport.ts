/**
 * Passaporte do animal: tipos da resposta de GET /animals/:id, rótulos e datas. Sem import de
 * React Native, para rodar no node:test.
 */

export type HealthKind =
  'vaccine' | 'deworming' | 'neutering' | 'treatment' | 'medication' | 'exam' | 'vet_visit';

export interface Passport {
  id: string;
  requestedId: string;
  mergedFrom: string[];
  name: string | null;
  species: string;
  size: string;
  sex: string | null;
  ageEstimate: string | null;
  temperament: string | null;
  status: string;
  care: {
    neutered: boolean | null;
    vaccinated: boolean | null;
    goodWithKids: boolean | null;
    goodWithAnimals: boolean | null;
  };
  firstSeenAt: string;
  photos: { url: string; thumbUrl: string }[];
  occurrences: {
    postId: string;
    type: string;
    status: string;
    approxLabel: string;
    createdAt: string;
    author: { name: string; handle: string };
  }[];
  health: {
    id: string;
    kind: HealthKind;
    title: string;
    notes: string | null;
    occurredOn: string;
    nextDueOn: string | null;
    visibility: 'public' | 'caretakers';
    recordedBy: string | null;
    canRemove: boolean;
  }[];
  custody: {
    id: string;
    kind: 'rescue' | 'foster' | 'adoption';
    startedAt: string;
    endedAt: string | null;
    person: { name: string; handle: string } | null;
  }[];
  timeline: {
    id: string;
    kind: 'occurrence' | 'status' | 'note' | 'sighting' | 'health' | 'custody';
    date: string;
    title: string;
    detail: string | null;
    postId: string | null;
  }[];
  permissions: { caretaker: boolean; canAddHealth: boolean; canLink: boolean };
  pendingLinks: {
    id: string;
    reason: string;
    createdAt: string;
    requesterName: string | null;
    otherPostId: string | null;
    otherLabel: string | null;
  }[];
}

export const healthKinds: {
  value: HealthKind;
  label: string;
  icon: string;
  publicByDefault: boolean;
}[] = [
  { value: 'vaccine', label: 'Vacina', icon: 'shield', publicByDefault: true },
  { value: 'deworming', label: 'Vermífugo', icon: 'droplet', publicByDefault: true },
  { value: 'neutering', label: 'Castração', icon: 'scissors', publicByDefault: true },
  { value: 'treatment', label: 'Tratamento', icon: 'activity', publicByDefault: false },
  { value: 'medication', label: 'Remédio', icon: 'package', publicByDefault: false },
  { value: 'exam', label: 'Exame', icon: 'clipboard', publicByDefault: false },
  { value: 'vet_visit', label: 'Consulta', icon: 'heart', publicByDefault: false },
];

export function healthKindLabel(kind: string): string {
  return healthKinds.find((item) => item.value === kind)?.label ?? 'Saúde';
}

export const custodyLabels: Record<string, string> = {
  rescue: 'Com quem resgatou',
  foster: 'Lar temporário',
  adoption: 'Adoção',
};

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * "12/03/2026", "12/3/26" ou "12032026" viram "2026-03-12". Devolve null para um dia que não
 * existe no calendário (31/02) ou texto incompleto.
 */
export function parseDayInput(raw: string): string | null {
  const digits = raw.trim();
  let day: number;
  let month: number;
  let year: number;
  const separated = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(digits);
  const compact = /^(\d{2})(\d{2})(\d{4})$/.exec(digits);
  if (separated) {
    day = Number(separated[1]);
    month = Number(separated[2]);
    year = Number(separated[3]);
  } else if (compact) {
    day = Number(compact[1]);
    month = Number(compact[2]);
    year = Number(compact[3]);
  } else {
    return null;
  }
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** O dia de hoje no calendário de Belém, em AAAA-MM-DD. */
export function belemToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** "2026-03-12" vira "12 mar 2026". */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return `${date} ${months[month - 1]} ${year}`;
}

/** "12/03/2026" para mostrar de volta no campo. */
export function dayInputValue(day: string): string {
  const [year, month, date] = day.split('-');
  return year && month && date ? `${date}/${month}/${year}` : day;
}

/** Quanto falta para a próxima dose: "vence em 12 dias", "venceu há 3 dias", "vence hoje". */
export function dueLabel(nextDueOn: string, now: Date = new Date()): string {
  const today = Date.parse(`${belemToday(now)}T00:00:00Z`);
  const due = Date.parse(`${nextDueOn}T00:00:00Z`);
  const days = Math.round((due - today) / 86_400_000);
  if (days === 0) return 'vence hoje';
  if (days > 0) return days === 1 ? 'vence amanhã' : `vence em ${days} dias`;
  const late = -days;
  return late === 1 ? 'venceu ontem' : `venceu há ${late} dias`;
}

/** "de 3 mar a 10 abr 2026", "desde 3 mar 2026". */
export function custodyPeriod(startedAt: string, endedAt: string | null): string {
  const start = belemDay(startedAt);
  if (!endedAt) return `desde ${formatDay(start)}`;
  return `de ${formatDay(start)} a ${formatDay(belemDay(endedAt))}`;
}

function belemDay(iso: string): string {
  return new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** A chave que evita registrar duas vezes quando a internet cai no meio do envio. */
export function newClientKey(random: () => number = Math.random): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let index = 0; index < 20; index += 1) {
    key += alphabet[Math.floor(random() * alphabet.length)];
  }
  return key;
}

/** Validação do formulário de saúde, com a mesma regra do servidor. */
export function healthFormError(input: {
  title: string;
  occurredOn: string | null;
  nextDueOn: string | null;
  nextDueRaw: string;
  today: string;
}): string | null {
  if (input.title.trim().length < 2) return 'Diga o que foi feito (ex.: V10, antipulgas).';
  if (!input.occurredOn) return 'Confira a data no formato dia/mês/ano.';
  if (input.occurredOn > input.today) return 'A data não pode ser no futuro.';
  if (input.nextDueRaw.trim() && !input.nextDueOn) return 'Confira a data da próxima dose.';
  if (input.nextDueOn && input.nextDueOn <= input.occurredOn) {
    return 'A próxima dose precisa ser depois do registro.';
  }
  return null;
}
