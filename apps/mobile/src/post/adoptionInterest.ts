/**
 * Ficha de quem quer adotar: cinco perguntas de tocar antes de abrir o WhatsApp. As respostas
 * vão escritas na primeira mensagem e ficam guardadas para quem cuida rever no post. Sem React
 * Native, para rodar no node:test. O servidor valida as mesmas opções em @patinha/shared.
 */

export type HomeKind = 'house' | 'apartment' | 'other';
export type SafeHome = 'yes' | 'no' | 'will_do';
export type OtherAnimals = 'none' | 'dogs' | 'cats' | 'both';
export type Household = 'alone' | 'all_agree' | 'not_sure';

export interface AdoptionAnswers {
  home: HomeKind;
  safeHome: SafeHome;
  otherAnimals: OtherAnimals;
  household: Household;
  hadPets: boolean;
}

/** Enquanto a pessoa preenche, cada pergunta pode estar sem resposta. */
export type AnswerDraft = Partial<AdoptionAnswers>;

export const NOTE_LIMIT = 300;

export interface Choice<Value> {
  value: Value;
  label: string;
}

export const homeChoices: Choice<HomeKind>[] = [
  { value: 'house', label: 'Casa' },
  { value: 'apartment', label: 'Apartamento' },
  { value: 'other', label: 'Outro' },
];

export const safeHomeChoices: Choice<SafeHome>[] = [
  { value: 'yes', label: 'Sim' },
  { value: 'will_do', label: 'Vou providenciar' },
  { value: 'no', label: 'Não' },
];

export const otherAnimalChoices: Choice<OtherAnimals>[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'dogs', label: 'Cães' },
  { value: 'cats', label: 'Gatos' },
  { value: 'both', label: 'Cães e gatos' },
];

export const householdChoices: Choice<Household>[] = [
  { value: 'alone', label: 'Moro só' },
  { value: 'all_agree', label: 'Todos concordam' },
  { value: 'not_sure', label: 'Ainda vou conversar' },
];

export const hadPetsChoices: Choice<boolean>[] = [
  { value: true, label: 'Sim' },
  { value: false, label: 'Primeira vez' },
];

/** A pergunta da tela fala do animal: gato pede tela na janela, cão pede muro ou portão. */
export function safeHomeQuestion(species: string): string {
  if (species === 'cat') return 'As janelas têm tela?';
  if (species === 'dog') return 'O quintal tem muro ou portão fechado?';
  return 'A casa é segura para o animal não fugir?';
}

/** Completa quando as cinco perguntas têm resposta. */
export function completeAnswers(draft: AnswerDraft): AdoptionAnswers | null {
  if (
    draft.home === undefined ||
    draft.safeHome === undefined ||
    draft.otherAnimals === undefined ||
    draft.household === undefined ||
    draft.hadPets === undefined
  ) {
    return null;
  }
  return {
    home: draft.home,
    safeHome: draft.safeHome,
    otherAnimals: draft.otherAnimals,
    household: draft.household,
    hadPets: draft.hadPets,
  };
}

function labelOf<Value>(choices: Choice<Value>[], value: Value): string {
  return choices.find((choice) => choice.value === value)?.label ?? '';
}

const safeHomeLine: Record<string, Record<SafeHome, string>> = {
  cat: { yes: 'Janelas com tela', will_do: 'Vai colocar tela nas janelas', no: 'Janelas sem tela' },
  dog: {
    yes: 'Quintal fechado',
    will_do: 'Vai fechar o quintal',
    no: 'Quintal sem muro ou portão',
  },
  other: { yes: 'Casa segura', will_do: 'Vai deixar a casa segura', no: 'Casa ainda sem proteção' },
};

const otherAnimalsLine: Record<OtherAnimals, string> = {
  none: 'Sem outros animais',
  dogs: 'Já tem cães',
  cats: 'Já tem gatos',
  both: 'Já tem cães e gatos',
};

const householdLine: Record<Household, string> = {
  alone: 'Mora só',
  all_agree: 'Todos em casa concordam',
  not_sure: 'Ainda vai conversar com a família',
};

/** Uma linha por resposta, na ordem das perguntas. Serve para a mensagem e para o post. */
export function answerLines(answers: AdoptionAnswers, species: string): string[] {
  return [
    `Mora em ${labelOf(homeChoices, answers.home).toLowerCase()}`,
    (safeHomeLine[species] ?? safeHomeLine.other)![answers.safeHome],
    otherAnimalsLine[answers.otherAnimals],
    householdLine[answers.household],
    answers.hadPets ? 'Já teve animal' : 'Primeiro animal',
  ];
}

/** Primeira mensagem do WhatsApp: o oi de sempre, as respostas e o link do animal. */
export function interestMessage(options: {
  authorFirstName: string;
  animalRef: string;
  answers: AdoptionAnswers;
  species: string;
  note: string;
  link: string;
}): string {
  const lines = answerLines(options.answers, options.species).map((line) => `• ${line}`);
  const note = options.note.trim();
  return [
    `Oi, ${options.authorFirstName}! Vi o post de adoção de ${options.animalRef} no Égua, adota! e quero adotar.`,
    '',
    'Minha ficha:',
    ...lines,
    ...(note ? ['', note] : []),
    '',
    options.link,
  ].join('\n');
}
