import { z } from 'zod';

/**
 * Busca de animais perdidos: compara um perdido com animais encontrados, resgatados ou vistos e
 * dá uma nota de 0 a 100 com os motivos. É sempre sugestão. Quem decide se é o mesmo animal é
 * o tutor, olhando as fotos e conversando com quem encontrou.
 */

export const animalColorSchema = z.enum([
  'black',
  'white',
  'gray',
  'brown',
  'caramel',
  'ginger',
  'cream',
  'brindle',
]);
export type AnimalColor = z.infer<typeof animalColorSchema>;

/** Até três cores: a principal e as manchas. */
export const animalColorsSchema = z
  .array(animalColorSchema)
  .max(3)
  .transform((colors) => [...new Set(colors)]);

export const animalColorLabel: Record<AnimalColor, string> = {
  black: 'preto',
  white: 'branco',
  gray: 'cinza',
  brown: 'marrom',
  caramel: 'caramelo',
  ginger: 'laranja',
  cream: 'bege',
  brindle: 'rajado',
};

/** Sem acento e em minúsculas, para comparar o que as pessoas escrevem. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palavras de cor que aparecem nas descrições de Belém. */
const colorWords: readonly (readonly [RegExp, AnimalColor])[] = [
  [/\bpret[oa]s?\b|\bnegr[oa]\b/, 'black'],
  [/\bbranc[oa]s?\b|\bbranquinh[oa]\b/, 'white'],
  [/\bcinza\b|\bcinzent[oa]\b|\bacinzentad[oa]\b/, 'gray'],
  [/\bmarrom\b|\bmarrons\b|\bchocolate\b/, 'brown'],
  [/\bcaramel[oa]?\b|\bdourad[oa]\b|\bamarel[oa]\b/, 'caramel'],
  [/\blaranja\b|\balaranjad[oa]\b|\bruiv[oa]\b/, 'ginger'],
  [/\bbege\b|\bcreme\b|\bclarinh[oa]\b/, 'cream'],
  [/\brajad[oa]\b|\btigrad[oa]\b|\bmalhad[oa]\b|\bescaminha\b|\btricolor\b/, 'brindle'],
];

/** Cores ditas no texto. Posts antigos não têm o campo de cores, mas costumam dizer a cor. */
export function colorsFromText(text: string): AnimalColor[] {
  const folded = foldText(text);
  const found: AnimalColor[] = [];
  for (const [pattern, color] of colorWords) {
    if (pattern.test(folded)) found.push(color);
  }
  return found;
}

/**
 * Sinais que ajudam a reconhecer um animal. Cada grupo vale como um só: "mancando" e "manca"
 * são a mesma coisa.
 */
const markWords: readonly (readonly [string, RegExp])[] = [
  ['coleira', /\bcoleira\b|\bplaquinha\b|\bpeitoral\b/],
  ['manca', /\bmanc[oa]\b|\bmancando\b|\bpata machucada\b/],
  ['cego', /\bceg[oa]\b|\bum olho so\b|\bsem um olho\b/],
  ['olho claro', /\bolhos? (azu(l|is)|claros?|verdes?)\b/],
  ['rabo cortado', /\b(sem|rabo) (rabo|cortado|curto)\b|\bcotoco\b/],
  ['orelha', /\borelhas? (caida|caidas|em pe|cortada|cortadas|grandes?)\b/],
  ['mancha', /\bmanchas?\b|\bpintas?\b/],
  ['cicatriz', /\bcicatriz\b|\bferida\b|\bmachucad[oa]\b/],
  ['pelo longo', /\bpelo (longo|grande|comprido)\b|\bpeludo\b|\bpeluda\b/],
  ['pelo curto', /\bpelo curto\b/],
  ['filhote', /\bfilhote\b|\bnovinh[oa]\b/],
  ['idoso', /\bidos[oa]\b|\bvelhinh[oa]\b/],
  ['castrado', /\bcastrad[oa]\b/],
  ['gravida', /\bgravida\b|\bprenha\b/],
  ['vira-lata', /\bvira[- ]?lata\b|\bsrd\b/],
  ['poodle', /\bpoodle\b/],
  ['pinscher', /\bpinscher\b/],
  ['shih tzu', /\bshih[- ]?tzu\b/],
  ['labrador', /\blabrador\b/],
  ['pitbull', /\bpit ?bull\b/],
  ['rottweiler', /\brottweiler\b/],
  ['pastor', /\bpastor alemao\b|\bpastor\b/],
  ['husky', /\bhusky\b/],
  ['dachshund', /\bdachshund\b|\bsalsicha\b/],
  ['siames', /\bsiames[a]?\b/],
  ['persa', /\bpersa\b/],
  ['frajola', /\bfrajola\b/],
];

/** Os sinais marcantes citados no texto, como "coleira" ou "manca". */
export function marksFromText(text: string): string[] {
  const folded = foldText(text);
  return markWords.filter(([, pattern]) => pattern.test(folded)).map(([mark]) => mark);
}

/**
 * Faixas de cor de uma foto, na ordem de `animalColorSchema` sem o rajado (que é padrão, não
 * cor). Cada número é a fração dos pontos daquela cor; somam 1.
 */
export const PHOTO_PALETTE_BINS = 7;

/** Em que faixa de cor cai um ponto RGB (0 a 255). */
export function colorBin(red: number, green: number, blue: number): number {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  if (light < 0.18) return 0; // preto
  if (light > 0.85 && saturation < 0.35) return 1; // branco
  if (saturation < 0.18) return light > 0.6 ? 1 : light < 0.3 ? 0 : 2; // cinza
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  // Fora dos tons de pelo (verde, azul, roxo): grama, céu e roupa. Conta como cinza, neutro.
  if (hue > 70 && hue < 330) return 2;
  if (light < 0.35) return 3; // marrom
  if (light > 0.72) return 6; // bege
  if (saturation > 0.6 && hue < 35) return 5; // laranja
  return 4; // caramelo
}

/** Faixa de cor da foto para o nome da cor, para explicar a comparação. */
export const paletteBinColor: readonly AnimalColor[] = [
  'black',
  'white',
  'gray',
  'brown',
  'caramel',
  'ginger',
  'cream',
];

/** Histograma de cores de pontos RGB seguidos (r, g, b, r, g, b...). */
export function paletteFromPixels(rgb: ArrayLike<number>): number[] {
  const bins = new Array<number>(PHOTO_PALETTE_BINS).fill(0);
  const points = Math.floor(rgb.length / 3);
  if (points === 0) return bins;
  for (let index = 0; index < points; index += 1) {
    const bin = colorBin(rgb[index * 3] ?? 0, rgb[index * 3 + 1] ?? 0, rgb[index * 3 + 2] ?? 0);
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  return bins.map((count) => Math.round((count / points) * 1000) / 1000);
}

/** Quanto duas paletas se sobrepõem, de 0 a 1. */
export function paletteSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== PHOTO_PALETTE_BINS || b.length !== PHOTO_PALETTE_BINS) return 0;
  let shared = 0;
  for (let index = 0; index < PHOTO_PALETTE_BINS; index += 1) {
    shared += Math.min(a[index] ?? 0, b[index] ?? 0);
  }
  return Math.max(0, Math.min(1, shared));
}

export type MatchSpecies = 'dog' | 'cat' | 'other';
export type MatchSize = 'small' | 'medium' | 'large';

export interface MatchAnimal {
  species: MatchSpecies;
  size: MatchSize;
  sex: 'male' | 'female' | 'unknown' | null;
  colors: readonly AnimalColor[];
  /** Nome, descrição e temperamento juntos. */
  text: string;
  /** Paleta da primeira foto, quando já foi calculada. */
  palette: readonly number[] | null;
}

export interface MatchContext {
  /** Menor distância entre onde o perdido sumiu e onde o outro animal foi visto. */
  distanceKm: number;
  /** Quando o perdido foi publicado. */
  lostAt: Date;
  /** Quando o outro animal foi visto pela última vez (post ou avistamento). */
  seenAt: Date;
}

export const matchReasonCodeSchema = z.enum([
  'species',
  'size',
  'colors',
  'distance',
  'time',
  'marks',
  'sex',
  'photo',
]);
export type MatchReasonCode = z.infer<typeof matchReasonCodeSchema>;

export interface MatchReason {
  code: MatchReasonCode;
  /** Frase curta para a tela, já em português. */
  label: string;
  /** Pontos ganhos (negativo quando pesa contra). */
  points: number;
  /** O máximo que esse critério dá. */
  max: number;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
}

/** Mais longe que isso não entra na sugestão: Belém e região. */
export const MATCH_MAX_DISTANCE_KM = 15;
/** Visto mais de 2 dias antes do sumiço não pode ser o mesmo animal (com folga para erro). */
export const MATCH_EARLY_DAYS = 2;
/** Depois disso a sugestão já não ajuda. */
export const MATCH_MAX_DAYS = 120;
/** A partir dessa nota aparece como sugestão. */
export const MATCH_SUGGEST_SCORE = 50;
/** A partir dessa nota a pessoa recebe aviso. */
export const MATCH_NOTIFY_SCORE = 65;

const DAY_MS = 86_400_000;

const sizeOrder: Record<MatchSize, number> = { small: 0, medium: 1, large: 2 };
const sizeLabel: Record<MatchSize, string> = {
  small: 'pequeno',
  medium: 'médio',
  large: 'grande',
};

function formatKm(km: number): string {
  if (km < 1) return 'menos de 1 km';
  // Meio quilômetro de precisão, igual à distância que o app mostra.
  return `${(Math.round(km * 2) / 2).toLocaleString('pt-BR')} km`;
}

function listLabel(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Todas as cores de um animal: as marcadas e as ditas no texto. */
export function colorsOf(animal: Pick<MatchAnimal, 'colors' | 'text'>): AnimalColor[] {
  return [...new Set([...animal.colors, ...colorsFromText(animal.text)])];
}

/**
 * Nota de compatibilidade entre um perdido e outro animal. Null quando não pode ser o mesmo:
 * outra espécie, longe demais, visto antes de sumir ou tempo demais depois.
 * Pesos: porte 20, cores 25, distância 25, tempo 10, sinais 10, foto 10 (sexo só tira pontos
 * quando os dois sexos são conhecidos e diferentes, e dá 5 quando batem). Nota máxima 100.
 */
export function scoreLostMatch(
  lost: MatchAnimal,
  other: MatchAnimal,
  context: MatchContext,
): MatchResult | null {
  if (lost.species !== other.species) return null;
  if (!Number.isFinite(context.distanceKm) || context.distanceKm > MATCH_MAX_DISTANCE_KM) {
    return null;
  }
  const days = (context.seenAt.getTime() - context.lostAt.getTime()) / DAY_MS;
  if (days < -MATCH_EARLY_DAYS || days > MATCH_MAX_DAYS) return null;

  const reasons: MatchReason[] = [{ code: 'species', label: 'Mesma espécie', points: 0, max: 0 }];

  const gap = Math.abs(sizeOrder[lost.size] - sizeOrder[other.size]);
  reasons.push(
    gap === 0
      ? { code: 'size', label: `Mesmo porte (${sizeLabel[lost.size]})`, points: 20, max: 20 }
      : gap === 1
        ? {
            code: 'size',
            label: `Porte parecido (${sizeLabel[lost.size]} e ${sizeLabel[other.size]})`,
            points: 6,
            max: 20,
          }
        : {
            code: 'size',
            label: `Porte bem diferente (${sizeLabel[lost.size]} e ${sizeLabel[other.size]})`,
            points: -10,
            max: 20,
          },
  );

  const lostColors = colorsOf(lost);
  const otherColors = colorsOf(other);
  if (lostColors.length > 0 && otherColors.length > 0) {
    const shared = lostColors.filter((color) => otherColors.includes(color));
    const union = new Set([...lostColors, ...otherColors]).size;
    const points = Math.round((shared.length / union) * 25);
    reasons.push(
      shared.length > 0
        ? {
            code: 'colors',
            label: `Cor em comum: ${listLabel(shared.map((color) => animalColorLabel[color]))}`,
            points,
            max: 25,
          }
        : {
            code: 'colors',
            label: `Cores diferentes (${listLabel(lostColors.map((c) => animalColorLabel[c]))} e ${listLabel(otherColors.map((c) => animalColorLabel[c]))})`,
            points: -5,
            max: 25,
          },
    );
  } else {
    reasons.push({ code: 'colors', label: 'Cor não informada', points: 0, max: 25 });
  }

  const near =
    context.distanceKm <= 1 ? 1 : 1 - (context.distanceKm - 1) / (MATCH_MAX_DISTANCE_KM - 1);
  reasons.push({
    code: 'distance',
    label: `Visto a ${formatKm(context.distanceKm)} de onde sumiu`,
    points: Math.round(25 * Math.max(0, near)),
    max: 25,
  });

  const absDays = Math.max(0, days);
  const recent = absDays <= 7 ? 1 : Math.max(0.2, 1 - (absDays - 7) / 60);
  const whenLabel =
    days < 0
      ? 'Visto perto do dia em que sumiu'
      : absDays < 1
        ? 'Visto no mesmo dia do sumiço'
        : `Visto ${Math.round(absDays)} ${Math.round(absDays) === 1 ? 'dia' : 'dias'} depois do sumiço`;
  reasons.push({ code: 'time', label: whenLabel, points: Math.round(10 * recent), max: 10 });

  const lostMarks = marksFromText(lost.text);
  const otherMarks = marksFromText(other.text);
  const sharedMarks = lostMarks.filter((mark) => otherMarks.includes(mark));
  if (sharedMarks.length > 0) {
    reasons.push({
      code: 'marks',
      label: `Em comum: ${listLabel(sharedMarks)}`,
      points: Math.min(10, sharedMarks.length * 5),
      max: 10,
    });
  }

  const knownSex = (sex: MatchAnimal['sex']) => sex === 'male' || sex === 'female';
  if (knownSex(lost.sex) && knownSex(other.sex)) {
    reasons.push(
      lost.sex === other.sex
        ? {
            code: 'sex',
            label: lost.sex === 'male' ? 'Os dois são machos' : 'As duas são fêmeas',
            points: 5,
            max: 5,
          }
        : { code: 'sex', label: 'Sexo diferente', points: -15, max: 5 },
    );
  }

  if (lost.palette && other.palette) {
    const similarity = paletteSimilarity(lost.palette, other.palette);
    // Abaixo de metade em comum, as fotos não dizem nada: fundo, luz e ângulo mudam muito.
    const points = Math.round(10 * Math.max(0, (similarity - 0.5) / 0.5));
    if (points > 0) {
      reasons.push({ code: 'photo', label: 'Tons parecidos nas fotos', points, max: 10 });
    }
  }

  const total = reasons.reduce((sum, reason) => sum + reason.points, 0);
  return { score: Math.max(0, Math.min(100, total)), reasons };
}

export type MatchStrength = 'high' | 'medium' | 'low';

export function matchStrength(score: number): MatchStrength {
  if (score >= 75) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

/** Busca feita por quem encontrou um animal, antes ou depois de publicar. */
export const lostSearchSchema = z.object({
  species: z.enum(['dog', 'cat', 'other']),
  size: z.enum(['small', 'medium', 'large']).optional(),
  sex: z.enum(['male', 'female', 'unknown']).optional(),
  colors: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      const raw = Array.isArray(value) ? value : (value ?? '').split(',');
      return raw
        .map((item) => item.trim())
        .filter((item): item is AnimalColor => animalColorSchema.safeParse(item).success)
        .slice(0, 3);
    }),
  text: z.string().trim().max(300).optional(),
  latitude: z.coerce.number().gte(-90).lte(90),
  longitude: z.coerce.number().gte(-180).lte(180),
});
export type LostSearchInput = z.infer<typeof lostSearchSchema>;

export const matchDecisionSchema = z.enum(['dismiss', 'confirm']);
export type MatchDecision = z.infer<typeof matchDecisionSchema>;
