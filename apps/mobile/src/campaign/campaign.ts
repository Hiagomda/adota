/**
 * Campanhas de arrecadação: tipos de GET /campaigns e /campaigns/:id, dinheiro em centavos e
 * validação dos formulários com as mesmas regras do servidor. Sem import de React Native, para
 * rodar no node:test.
 */

export type CampaignPhase = 'active' | 'ended' | 'closed' | 'suspended';
export type EntryStatus = 'pending' | 'confirmed' | 'rejected' | 'voided';

export interface CampaignSummary {
  id: string;
  title: string;
  goalCents: number;
  raisedCents: number;
  spentCents: number;
  deadline: string;
  phase: CampaignPhase;
  animalId: string | null;
  postId: string | null;
  coverUrl: string | null;
  owner: { name: string; handle: string; verified: boolean; avatarUrl: string | null };
  createdAt: string;
}

export interface CampaignEntry {
  id: string;
  kind: 'donation' | 'expense';
  amountCents: number;
  description: string;
  occurredOn: string;
  status: EntryStatus;
  who: string;
  mine: boolean;
  hasReceipt: boolean;
  receipt: { url: string; thumbUrl: string } | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface CampaignDetail {
  id: string;
  title: string;
  purpose: string;
  goalCents: number;
  deadline: string;
  phase: CampaignPhase;
  closingNote: string | null;
  closedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  pixKey: string | null;
  paymentNotice: string;
  coverUrl: string | null;
  owner: { name: string; handle: string; verified: boolean; avatarUrl: string | null };
  animal: { id: string; name: string | null; species: string } | null;
  post: { id: string; approxLabel: string; type: string } | null;
  totals: {
    raisedCents: number;
    spentCents: number;
    balanceCents: number;
    pendingCents: number | null;
    pendingCount: number | null;
    confirmedDonations: number;
  };
  entries: CampaignEntry[];
  history: {
    id: string;
    action: string;
    actor: string;
    summary: string;
    note: string | null;
    createdAt: string;
  }[];
  permissions: {
    isOwner: boolean;
    isStaff: boolean;
    canEdit: boolean;
    canAddEntries: boolean;
    canClose: boolean;
    canPledge: boolean;
    canReport: boolean;
  };
}

export const MIN_GOAL_CENTS = 1_000;
export const MAX_GOAL_CENTS = 100_000_000;

/**
 * "150", "150,5", "1.500,00" ou "1500.00" viram centavos. Devolve null para texto que não é
 * valor, zero ou negativo. Vírgula é o decimal do Brasil; ponto sozinho com 1 ou 2 casas também.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.replace(/R\$|\s/g, '');
  if (!text) return null;
  let normalized: string;
  if (text.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    normalized = text;
  } else if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    return null;
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 150000 vira "R$ 1.500,00". */
export function formatCents(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

/** 150000 vira "1.500,00", para voltar ao campo de valor. */
export function moneyInputValue(cents: number): string {
  return formatCents(cents).replace(/^R\$\s*/, '');
}

/** Quanto da meta já foi confirmado, de 0 a 1. */
export function goalProgress(raisedCents: number, goalCents: number): number {
  if (goalCents <= 0) return 0;
  return Math.min(1, Math.max(0, raisedCents / goalCents));
}

export const phaseLabels: Record<CampaignPhase, string> = {
  active: 'Recebendo doações',
  ended: 'Prazo encerrado',
  closed: 'Encerrada com prestação de contas',
  suspended: 'Suspensa para conferência',
};

export const entryStatusLabels: Record<EntryStatus, string> = {
  pending: 'Esperando o responsável conferir',
  confirmed: 'Confirmado com comprovante',
  rejected: 'Não encontrado no extrato',
  voided: 'Anulado',
};

/** "faltam 12 dias", "último dia", "terminou há 3 dias". `today` no calendário de Belém. */
export function deadlineLabel(deadline: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (Number.isNaN(days)) return '';
  if (days === 0) return 'último dia';
  if (days === 1) return 'falta 1 dia';
  if (days > 1) return `faltam ${days} dias`;
  return days === -1 ? 'terminou ontem' : `terminou há ${-days} dias`;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Validação de criar campanha, igual à do servidor. */
export function campaignFormError(input: {
  title: string;
  purpose: string;
  goalCents: number | null;
  deadline: string | null;
  pixKey: string;
  today: string;
}): string | null {
  if (input.title.trim().length < 6) return 'Dê um título com pelo menos 6 letras.';
  if (input.purpose.trim().length < 30) {
    return 'Explique para que é o dinheiro e por que esse valor (pelo menos 30 letras).';
  }
  if (input.goalCents === null) return 'A meta precisa ser um valor, por exemplo 1.500,00.';
  if (input.goalCents < MIN_GOAL_CENTS) return 'A meta mínima é R$ 10,00.';
  if (input.goalCents > MAX_GOAL_CENTS) return 'A meta passou do limite.';
  if (!input.deadline) return 'Confira o prazo no formato dia/mês/ano.';
  if (input.deadline < input.today) return 'O prazo não pode ser no passado.';
  if (input.deadline > addDays(input.today, 365)) return 'O prazo pode ser de até um ano.';
  if (input.pixKey.trim().length < 3) return 'Coloque a chave Pix que vai receber as doações.';
  return null;
}

/** Validação de um lançamento ou aviso de doação. */
export function entryFormError(input: {
  amountCents: number | null;
  occurredOn: string | null;
  today: string;
  description?: string;
  needsReceipt: boolean;
  hasReceipt: boolean;
}): string | null {
  if (input.amountCents === null) return 'O valor precisa ser em reais, por exemplo 50,00.';
  if (input.amountCents > MAX_GOAL_CENTS) return 'O valor passou do limite.';
  if (!input.occurredOn) return 'Confira a data no formato dia/mês/ano.';
  if (input.occurredOn > input.today) return 'A data não pode ser no futuro.';
  if (input.description !== undefined && input.description.trim().length < 3) {
    return 'Diga o que foi (ex.: raio-x, ração, doação na feira).';
  }
  if (input.needsReceipt && !input.hasReceipt) return 'Anexe a foto do comprovante.';
  return null;
}
