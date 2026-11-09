/**
 * Termo de adoção (GET /posts/:id/adoption-term e /me/adoption-term). Espelho do
 * packages/shared/src/adoptionTerm.ts, sem import de React Native, para rodar no node:test.
 */

export interface AdoptionTermPage {
  source: 'app' | 'org';
  giverName: string;
  requireIdentity: boolean;
  role: 'tutor' | 'responsible' | 'team' | null;
  canAccept: boolean;
  /** Quem entregou ainda espera o aceite de quem adotou. */
  waiting: boolean;
  text: string;
  accepted: {
    fullName: string;
    cpf: string | null;
    address: string | null;
    acceptedAt: string;
    person: { name: string; handle: string };
  } | null;
}

export interface OrgTerm {
  body: string | null;
  requireIdentity: boolean;
  updatedAt: string | null;
  appTemplate: string;
  fields: Record<string, string>;
}

export const ORG_TERM_MIN = 200;
export const ORG_TERM_MAX = 8000;

/** Põe pontos e traço enquanto a pessoa digita: 529.982.247-25. */
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  const head = parts.join('.');
  return digits.length > 9 ? `${head}-${digits.slice(9)}` : head;
}

/** Nome e sobrenome, como no termo em papel. */
export function looksLikeFullName(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return value.trim().length >= 5 && words.length >= 2;
}

/** O que o cartão do acompanhamento diz sobre o termo. */
export function termStatusLine(page: AdoptionTermPage | undefined): string | null {
  if (!page || !page.role) return null;
  if (page.accepted) {
    const when = new Date(page.accepted.acceptedAt).toLocaleDateString('pt-BR');
    return page.role === 'tutor'
      ? `Você aceitou em ${when}.`
      : `${page.accepted.fullName} aceitou em ${when}.`;
  }
  if (page.canAccept) return 'Leia com calma e aceite para concluir a adoção.';
  if (page.waiting) return 'Esperando quem adotou ler e aceitar.';
  return null;
}

/** Os campos que a ONG pode usar no texto, na ordem em que aparecem na ajuda. */
export function fieldHelp(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, label]) => `{${key}} = ${label}`)
    .join('\n');
}
