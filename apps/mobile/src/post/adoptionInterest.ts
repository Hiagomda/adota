/**
 * Ficha de quem quer adotar: perguntas de tocar antes de abrir o WhatsApp. Algumas só aparecem
 * conforme a resposta anterior: condomínio só para apartamento, a pergunta de segurança muda com
 * a moradia e a espécie, criança só para quem não mora só, cuidados só para quem já tem animais.
 * As respostas vão escritas na primeira mensagem e ficam guardadas para quem cuida rever no post.
 * Sem React Native, para rodar no node:test. O servidor valida as mesmas opções em @patinha/shared.
 */

export type HomeKind = 'house' | 'apartment' | 'other';
export type BuildingAllows = 'yes' | 'unknown' | 'no';
export type SafeHome = 'yes' | 'no' | 'will_do';
export type OtherAnimals = 'none' | 'dogs' | 'cats' | 'both';
export type OthersCared = 'yes' | 'some' | 'no';
export type Household = 'alone' | 'all_agree' | 'not_sure';
export type LivesWith = 'alone' | 'others';

export interface AdoptionAnswers {
  home: HomeKind;
  buildingAllows?: BuildingAllows;
  safeHome: SafeHome;
  otherAnimals: OtherAnimals;
  othersCared?: OthersCared;
  household: Household;
  kids?: boolean;
  hadPets: boolean;
}

/**
 * Enquanto a pessoa preenche, cada pergunta pode estar sem resposta. `livesWith` só existe na
 * tela: "moro só" vira household 'alone'; "com outras pessoas" pede se todos concordam.
 */
export type AnswerDraft = Partial<AdoptionAnswers> & { livesWith?: LivesWith };

export const NOTE_LIMIT = 300;

export interface Choice<Value> {
  value: Value;
  label: string;
}

export const homeChoices: Choice<HomeKind>[] = [
  { value: 'house', label: 'Casa' },
  { value: 'apartment', label: 'Apartamento' },
  { value: 'other', label: 'Outro (kitnet, sítio...)' },
];

export const buildingChoices: Choice<BuildingAllows>[] = [
  { value: 'yes', label: 'Aceita' },
  { value: 'unknown', label: 'Não sei' },
  { value: 'no', label: 'Não aceita' },
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

export const othersCaredChoices: Choice<OthersCared>[] = [
  { value: 'yes', label: 'Sim, todos' },
  { value: 'some', label: 'Alguns' },
  { value: 'no', label: 'Ainda não' },
];

export const livesWithChoices: Choice<LivesWith>[] = [
  { value: 'alone', label: 'Moro só' },
  { value: 'others', label: 'Com outras pessoas' },
];

export const householdChoices: Choice<Household>[] = [
  { value: 'all_agree', label: 'Todos concordam' },
  { value: 'not_sure', label: 'Ainda vou conversar' },
];

export const kidsChoices: Choice<boolean>[] = [
  { value: true, label: 'Sim' },
  { value: false, label: 'Não' },
];

export const hadPetsChoices: Choice<boolean>[] = [
  { value: true, label: 'Sim' },
  { value: false, label: 'Primeira vez' },
];

/**
 * A pergunta de segurança fala da moradia e do animal: gato em apartamento pede tela na janela e
 * na varanda, cão em casa pede muro e portão. Sem moradia escolhida, vale a pergunta geral.
 */
export function safeHomeQuestion(species: string, home?: HomeKind): string {
  if (species === 'cat') {
    if (home === 'apartment') return 'Janelas e varanda têm tela?';
    if (home === 'house') return 'Janelas têm tela e o gato vai ficar só dentro de casa?';
    return 'As janelas têm tela?';
  }
  if (species === 'dog') {
    if (home === 'apartment') return 'Varanda e janelas têm tela ou grade?';
    if (home === 'house') return 'O quintal tem muro e portão fechado?';
    if (home === 'other') return 'O lugar é cercado ou tem portão fechado?';
  }
  return 'A casa é segura para o animal não fugir?';
}

export type QuestionKey =
  | 'home'
  | 'buildingAllows'
  | 'safeHome'
  | 'otherAnimals'
  | 'othersCared'
  | 'livesWith'
  | 'household'
  | 'kids'
  | 'hadPets';

/** As perguntas que valem para o que a pessoa já respondeu, na ordem da tela. */
export function visibleQuestions(draft: AnswerDraft): QuestionKey[] {
  const livesWith = livesWithOf(draft);
  return [
    'home',
    ...(draft.home === 'apartment' ? (['buildingAllows'] as const) : []),
    'safeHome',
    'otherAnimals',
    ...(draft.otherAnimals && draft.otherAnimals !== 'none' ? (['othersCared'] as const) : []),
    'livesWith',
    ...(livesWith === 'others' ? (['household', 'kids'] as const) : []),
    'hadPets',
  ];
}

/** "Moro só" ou "com outras pessoas", lido da escolha na tela ou da ficha guardada. */
export function livesWithOf(draft: AnswerDraft): LivesWith | undefined {
  if (draft.livesWith) return draft.livesWith;
  if (draft.household === 'alone') return 'alone';
  if (draft.household) return 'others';
  return undefined;
}

/** Quantas perguntas que estão na tela ainda não têm resposta. */
export function missingCount(draft: AnswerDraft): number {
  const livesWith = livesWithOf(draft);
  return visibleQuestions(draft).filter((key) => {
    if (key === 'livesWith') return livesWith === undefined;
    if (key === 'household') return draft.household === undefined || draft.household === 'alone';
    return draft[key] === undefined;
  }).length;
}

/** Completa quando toda pergunta da tela tem resposta. Respostas que não cabem mais saem. */
export function completeAnswers(draft: AnswerDraft): AdoptionAnswers | null {
  if (missingCount(draft) > 0) return null;
  const livesWith = livesWithOf(draft);
  if (
    draft.home === undefined ||
    draft.safeHome === undefined ||
    draft.otherAnimals === undefined ||
    draft.hadPets === undefined
  ) {
    return null;
  }
  const household: Household = livesWith === 'alone' ? 'alone' : (draft.household ?? 'not_sure');
  return {
    home: draft.home,
    ...(draft.home === 'apartment' && draft.buildingAllows
      ? { buildingAllows: draft.buildingAllows }
      : {}),
    safeHome: draft.safeHome,
    otherAnimals: draft.otherAnimals,
    ...(draft.otherAnimals !== 'none' && draft.othersCared
      ? { othersCared: draft.othersCared }
      : {}),
    household,
    ...(household !== 'alone' && draft.kids !== undefined ? { kids: draft.kids } : {}),
    hadPets: draft.hadPets,
  };
}

/** O que o animal precisa e a ficha diz o contrário. Quem quer adotar vê antes de mandar. */
export function fitWarnings(
  draft: AnswerDraft,
  care: { goodWithKids?: boolean | null; goodWithAnimals?: boolean | null } | null | undefined,
): string[] {
  const warnings: string[] = [];
  if (care?.goodWithAnimals === false && draft.otherAnimals && draft.otherAnimals !== 'none') {
    warnings.push('Quem cuida disse que ele fica melhor sem outros bichos. Conversem sobre isso.');
  }
  if (care?.goodWithKids === false && draft.kids === true && livesWithOf(draft) === 'others') {
    warnings.push('Quem cuida disse que ele fica melhor sem crianças. Conversem sobre isso.');
  }
  if (draft.home === 'apartment' && draft.buildingAllows === 'no') {
    warnings.push('O condomínio não aceita animais. Vale confirmar antes de seguir.');
  }
  return warnings;
}

function labelOf<Value>(choices: Choice<Value>[], value: Value): string {
  return choices.find((choice) => choice.value === value)?.label ?? '';
}

const homeLine: Record<HomeKind, string> = {
  house: 'Mora em casa',
  apartment: 'Mora em apartamento',
  other: 'Mora em outro tipo de lugar',
};

const buildingLine: Record<BuildingAllows, string> = {
  yes: 'Condomínio aceita animais',
  unknown: 'Ainda vai confirmar se o condomínio aceita animais',
  no: 'Condomínio não aceita animais',
};

const safeHomeLine: Record<string, Record<SafeHome, string>> = {
  cat: { yes: 'Janelas com tela', will_do: 'Vai colocar tela nas janelas', no: 'Janelas sem tela' },
  dog: {
    yes: 'Quintal fechado',
    will_do: 'Vai fechar o quintal',
    no: 'Quintal sem muro ou portão',
  },
  other: { yes: 'Casa segura', will_do: 'Vai deixar a casa segura', no: 'Casa ainda sem proteção' },
};

/** Em apartamento, a proteção é tela na varanda; para gato em casa, tela e ficar dentro. */
const safeHomeLineByHome: Partial<Record<string, Record<SafeHome, string>>> = {
  'cat:apartment': {
    yes: 'Janelas e varanda com tela',
    will_do: 'Vai colocar tela nas janelas e na varanda',
    no: 'Janelas e varanda sem tela',
  },
  'cat:house': {
    yes: 'Janelas com tela e gato só dentro de casa',
    will_do: 'Vai colocar tela e deixar o gato só dentro de casa',
    no: 'Janelas sem tela',
  },
  'dog:apartment': {
    yes: 'Varanda e janelas com tela ou grade',
    will_do: 'Vai colocar tela ou grade na varanda',
    no: 'Varanda e janelas sem proteção',
  },
  'dog:other': {
    yes: 'Lugar cercado ou com portão',
    will_do: 'Vai cercar o lugar',
    no: 'Lugar sem cerca ou portão',
  },
};

const otherAnimalsLine: Record<OtherAnimals, string> = {
  none: 'Sem outros animais',
  dogs: 'Já tem cães',
  cats: 'Já tem gatos',
  both: 'Já tem cães e gatos',
};

const othersCaredLine: Record<OthersCared, string> = {
  yes: 'Todos vacinados e castrados',
  some: 'Alguns vacinados e castrados',
  no: 'Ainda sem vacina ou castração',
};

const householdLine: Record<Household, string> = {
  alone: 'Mora só',
  all_agree: 'Todos em casa concordam',
  not_sure: 'Ainda vai conversar com a família',
};

/** Uma linha por resposta, na ordem das perguntas. Serve para a mensagem e para o post. */
export function answerLines(answers: AdoptionAnswers, species: string): string[] {
  const safe =
    safeHomeLineByHome[`${species}:${answers.home}`] ??
    safeHomeLine[species] ??
    safeHomeLine.other!;
  return [
    homeLine[answers.home] ?? `Mora em ${labelOf(homeChoices, answers.home).toLowerCase()}`,
    ...(answers.buildingAllows ? [buildingLine[answers.buildingAllows]] : []),
    safe[answers.safeHome],
    otherAnimalsLine[answers.otherAnimals],
    ...(answers.othersCared ? [othersCaredLine[answers.othersCared]] : []),
    householdLine[answers.household],
    ...(answers.kids === undefined ? [] : [answers.kids ? 'Tem criança em casa' : 'Sem crianças']),
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
