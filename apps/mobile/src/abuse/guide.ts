/**
 * Como denunciar maus-tratos em Belém: canais oficiais, sinais e o relato pronto para copiar.
 * Sem React Native, para o node:test. Os canais foram conferidos em 31/10/2026 em notícias da
 * Agência Pará (2023) e d'O Liberal (2022); confira de novo antes de mudar um número.
 */

export type ChannelAction = { kind: 'call'; number: string } | { kind: 'link'; url: string };

export interface Channel {
  id: string;
  title: string;
  when: string;
  detail: string;
  actionLabel: string;
  action: ChannelAction;
}

export const DELEGACIA_VIRTUAL_URL = 'https://www.delegaciavirtual.pa.gov.br';

export const channels: Channel[] = [
  {
    id: 'pm',
    title: 'Polícia Militar · 190',
    when: 'Está acontecendo agora',
    detail: 'Agressão, envenenamento ou animal em risco de vida neste momento.',
    actionLabel: 'Ligar 190',
    action: { kind: 'call', number: '190' },
  },
  {
    id: 'disque',
    title: 'Disque-Denúncia · 181',
    when: 'Qualquer hora, 24 horas',
    detail:
      'A ligação vai para a Demapa, a divisão da Polícia Civil do Pará que cuida de meio ambiente e proteção animal.',
    actionLabel: 'Ligar 181',
    action: { kind: 'call', number: '181' },
  },
  {
    id: 'virtual',
    title: 'Delegacia Virtual do Pará',
    when: 'Pela internet, com fotos',
    detail: 'Registre o boletim de ocorrência sem sair de casa e guarde o número do protocolo.',
    actionLabel: 'Abrir a Delegacia Virtual',
    action: { kind: 'link', url: DELEGACIA_VIRTUAL_URL },
  },
];

/** O que costuma ser maus-tratos. A lista ajuda a reconhecer; quem decide é a autoridade. */
export const signs = [
  'Bater, ferir, envenenar ou mutilar',
  'Abandonar na rua ou em casa vazia',
  'Deixar sem água, comida ou sombra',
  'Manter preso em corrente curta ou lugar apertado e sujo',
  'Não levar ao veterinário quando está ferido ou doente',
  'Usar em briga de animais',
];

export const evidenceSteps = [
  'Não enfrente ninguém. Sua segurança vem primeiro.',
  'Fotografe ou filme de um lugar seguro, sem invadir.',
  'Anote o dia, a hora, o endereço e um ponto de referência.',
  'Guarde os arquivos originais e o nome de quem também viu.',
];

export const LAW_NOTE =
  'Maus-tratos é crime (Lei 9.605/1998, art. 32). Contra cão ou gato, a pena é de 2 a 5 anos de reclusão (Lei 14.064/2020).';

export interface ReportDraft {
  what: string;
  where: string;
  when: string;
  animal: string;
}

export const DRAFT_LIMITS: Record<keyof ReportDraft, number> = {
  what: 600,
  where: 200,
  when: 80,
  animal: 120,
};

/** Precisa pelo menos do que aconteceu e de onde: sem isso a polícia não tem como ir. */
export function draftReady(draft: ReportDraft): boolean {
  return draft.what.trim().length >= 10 && draft.where.trim().length >= 5;
}

/** O relato organizado para colar na Delegacia Virtual ou ler na ligação. */
export function reportText(draft: ReportDraft): string {
  const lines = ['Denúncia de maus-tratos a animal'];
  const add = (label: string, value: string) => {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (clean) lines.push(`${label}: ${clean}`);
  };
  add('O que aconteceu', draft.what);
  add('Onde', draft.where);
  add('Quando', draft.when);
  add('Animal', draft.animal);
  return lines.join('\n');
}

export function channelUrl(action: ChannelAction): string {
  return action.kind === 'call' ? `tel:${action.number}` : action.url;
}
