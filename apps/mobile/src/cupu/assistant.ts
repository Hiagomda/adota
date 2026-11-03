/**
 * Assistente do Cupu: perguntas guiadas para quem não sabe por onde começar. Não usa IA nem
 * servidor: as regras ficam aqui, à vista, e a pessoa revisa tudo antes de publicar. Sem import
 * de React Native, para rodar no node:test.
 */

/** O que a pessoa diz que está acontecendo, na primeira pergunta. */
export type Situation = 'street' | 'lost_mine' | 'found_owner' | 'abuse' | 'need_help';

/** O que ela vê no animal da rua. Pode marcar mais de um. */
export type Sign =
  'bleeding' | 'hit_by_car' | 'trapped' | 'cant_walk' | 'puppies' | 'sick' | 'calm';

export type Urgency = 'high' | 'medium' | 'low';
export type Species = 'dog' | 'cat' | 'other';
export type LostWhen = 'today' | 'yesterday' | 'older';

export const situations: { value: Situation; title: string; detail: string }[] = [
  {
    value: 'street',
    title: 'Um animal na rua precisa de ajuda',
    detail: 'Ferido, preso, doente, filhotes sozinhos ou só solto na rua.',
  },
  {
    value: 'lost_mine',
    title: 'Meu animal sumiu',
    detail: 'Fugiu de casa ou se perdeu na rua.',
  },
  {
    value: 'found_owner',
    title: 'Achei um animal que parece ter dono',
    detail: 'Tem coleira, é manso ou parece perdido.',
  },
  {
    value: 'abuse',
    title: 'Alguém está maltratando um animal',
    detail: 'Agressão, abandono, corrente curta, sem água ou comida.',
  },
  {
    value: 'need_help',
    title: 'Preciso de ração, remédio ou lar temporário',
    detail: 'Para um animal que já está com você.',
  },
];

export const signOptions: { value: Sign; label: string }[] = [
  { value: 'bleeding', label: 'Está sangrando' },
  { value: 'hit_by_car', label: 'Foi atropelado' },
  { value: 'trapped', label: 'Está preso (bueiro, grade, fio, água)' },
  { value: 'cant_walk', label: 'Não consegue andar' },
  { value: 'puppies', label: 'Filhotes sem a mãe' },
  { value: 'sick', label: 'Magro, com sarna ou parece doente' },
  { value: 'calm', label: 'Parece bem, só está solto' },
];

/** Sinais em que a vida do animal pode depender dos próximos minutos. */
const graveSigns: readonly Sign[] = ['bleeding', 'hit_by_car', 'trapped', 'cant_walk'];

export function isGrave(signs: readonly Sign[]): boolean {
  return signs.some((sign) => graveSigns.includes(sign));
}

/**
 * Urgência sugerida, sempre revisável: grave ou filhotes sozinhos é "Urgente", doente é
 * "Atenção", e só solto na rua "Pode esperar". Sem nada marcado fica "Atenção", para não
 * esconder um caso que a pessoa não soube descrever.
 */
export function suggestUrgency(signs: readonly Sign[]): Urgency {
  if (isGrave(signs) || signs.includes('puppies')) return 'high';
  if (signs.includes('sick')) return 'medium';
  if (signs.length > 0 && signs.every((sign) => sign === 'calm')) return 'low';
  return 'medium';
}

export const urgencyLabel: Record<Urgency, string> = {
  high: 'Urgente',
  medium: 'Atenção',
  low: 'Pode esperar',
};

/** Por que o Cupu sugeriu essa urgência, em uma frase. */
export function urgencyReason(signs: readonly Sign[]): string {
  const urgency = suggestUrgency(signs);
  if (urgency === 'high') {
    return isGrave(signs)
      ? 'Ferimento, atropelamento, animal preso ou que não anda pode piorar em minutos.'
      : 'Filhote sozinho não aguenta muito tempo sem a mãe, no sol ou na chuva.';
  }
  if (urgency === 'low') return 'Sem ferimento aparente: dá tempo de organizar a ajuda.';
  return signs.includes('sick')
    ? 'Doente precisa de cuidado logo, mas não corre risco nos próximos minutos.'
    : 'Sem saber como ele está, é melhor alguém olhar logo.';
}

const signSentence: Record<Sign, string> = {
  bleeding: 'Está ferido e sangrando.',
  hit_by_car: 'Parece que foi atropelado.',
  trapped: 'Está preso e precisa de ajuda para sair.',
  cant_walk: 'Não consegue andar.',
  puppies: 'Filhotes sozinhos, sem a mãe por perto.',
  sick: 'Está magro ou parece doente.',
  calm: 'Está solto na rua, sem ferimento aparente.',
};

const speciesWord: Record<Species, string> = { dog: 'Cachorro', cat: 'Gato', other: 'Animal' };

/** Deixa o texto livre com cara de frase: espaços limpos, primeira letra maiúscula e ponto. */
export function tidySentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const first = clean.charAt(0).toLocaleUpperCase('pt-BR') + clean.slice(1);
  return /[.!?…]$/.test(first) ? first : `${first}.`;
}

/** Ordem fixa: o mais grave primeiro, para quem lê no feed entender na primeira linha. */
const signOrder: readonly Sign[] = signOptions.map((option) => option.value);

/** Descrição do resgate montada com o que a pessoa marcou, mais o que ela escreveu. */
export function rescueDescription(signs: readonly Sign[], species: Species, extra: string): string {
  const picked = signOrder.filter(
    (sign) => signs.includes(sign) && !(sign === 'calm' && signs.length > 1),
  );
  const parts = [
    signs.includes('puppies') ? null : `${speciesWord[species]} na rua.`,
    ...picked.map((sign) => signSentence[sign]),
    tidySentence(extra),
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

const lostWhenSentence: Record<LostWhen, string> = {
  today: 'Sumiu hoje.',
  yesterday: 'Sumiu ontem.',
  older: 'Sumiu há alguns dias.',
};

/** Descrição do perdido: quando sumiu, se usa coleira e o que a pessoa contou. */
export function lostDescription(when: LostWhen, collar: boolean, extra: string): string {
  return [lostWhenSentence[when], collar ? 'Usa coleira.' : null, tidySentence(extra)]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

/** Quem sumiu hoje está perto e ainda dá para achar andando pelo bairro. */
export function lostUrgency(when: LostWhen): Urgency {
  return when === 'older' ? 'medium' : 'high';
}

export interface Guidance {
  id: string;
  text: string;
}

/** O que fazer agora, antes de publicar. Orientação fixa, revisada, sem diagnóstico. */
export function rescueGuidance(signs: readonly Sign[]): Guidance[] {
  const steps: Guidance[] = [];
  if (signs.includes('hit_by_car') || signs.includes('trapped')) {
    steps.push({
      id: 'safety',
      text: 'Não se arrisque. No trânsito, fique na calçada e peça para alguém sinalizar os carros.',
    });
  }
  if (signs.includes('trapped')) {
    steps.push({
      id: 'firefighters',
      text: 'Fio elétrico, água funda ou altura: não chegue perto e ligue 193, o Corpo de Bombeiros.',
    });
  }
  if (isGrave(signs)) {
    steps.push({
      id: 'approach',
      text: 'Chegue devagar, falando baixo. Animal com dor pode morder sem querer.',
    });
  }
  if (signs.includes('bleeding')) {
    steps.push({
      id: 'bleeding',
      text: 'Se ele deixar, aperte um pano limpo sobre o ferimento. Não amarre nada apertado.',
    });
  }
  if (signs.includes('hit_by_car') || signs.includes('cant_walk')) {
    steps.push({
      id: 'move',
      text: 'Para tirar do lugar, passe um pano firme ou papelão por baixo do corpo, sem dobrar a coluna.',
    });
  }
  if (signs.includes('puppies')) {
    steps.push({
      id: 'puppies',
      text: 'Espere um pouco de longe: a mãe pode ter saído para comer. No sol ou na chuva, cubra com um pano.',
    });
  }
  if (isGrave(signs) || signs.includes('sick')) {
    steps.push({
      id: 'medicine',
      text: 'Não dê remédio de gente. Muitos são venenosos para cachorro e gato.',
    });
  }
  if (isGrave(signs)) {
    steps.push({
      id: 'publish',
      text: 'Publique o resgate agora: quem está perto recebe o aviso na hora.',
    });
  }
  return steps;
}

/** Maus-tratos acontecendo agora vai direto para o 190; o resto, para o guia de denúncia. */
export const abuseNowGuidance: Guidance[] = [
  { id: 'call', text: 'Ligue 190. A Polícia Militar atende maus-tratos que estão acontecendo.' },
  { id: 'distance', text: 'Não enfrente ninguém. Fique longe e em lugar seguro.' },
  {
    id: 'evidence',
    text: 'Se der sem se expor, grave vídeo ou tire foto e anote o endereço e a hora.',
  },
];

export interface CupuPrefill {
  id: string;
  kind: 'rescue_alert' | 'lost';
  urgency: Urgency;
  species: Species | null;
  description: string;
}

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lê o que o assistente mandou para a tela de publicar. Parâmetro de rota vem de fora (um link
 * também abre essa tela), então tudo é conferido e o que não bate é ignorado.
 */
export function cupuPrefill(params: {
  kind?: Param;
  urgency?: Param;
  species?: Param;
  description?: Param;
  cupu?: Param;
}): CupuPrefill | null {
  const id = first(params.cupu);
  const kind = first(params.kind);
  const urgency = first(params.urgency);
  if (!id || (kind !== 'rescue_alert' && kind !== 'lost')) return null;
  if (urgency !== 'high' && urgency !== 'medium' && urgency !== 'low') return null;
  const species = first(params.species);
  return {
    id,
    kind,
    urgency,
    species: species === 'dog' || species === 'cat' || species === 'other' ? species : null,
    description: (first(params.description) ?? '').slice(0, 1000),
  };
}
