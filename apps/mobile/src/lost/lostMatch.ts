/**
 * Busca de animais perdidos: tipos das respostas da API, cores do pelo e textos. Sem import de
 * React Native, para rodar no node:test. A nota vem pronta do servidor; aqui só se mostra.
 */

export type FurColor =
  'black' | 'white' | 'gray' | 'brown' | 'caramel' | 'ginger' | 'cream' | 'brindle';

export const furColors: readonly { value: FurColor; label: string }[] = [
  { value: 'caramel', label: 'Caramelo' },
  { value: 'black', label: 'Preto' },
  { value: 'white', label: 'Branco' },
  { value: 'brown', label: 'Marrom' },
  { value: 'gray', label: 'Cinza' },
  { value: 'ginger', label: 'Laranja' },
  { value: 'cream', label: 'Bege' },
  { value: 'brindle', label: 'Rajado' },
];

/** O servidor aceita até três cores: a principal e as manchas. */
export const MAX_FUR_COLORS = 3;

/** Marca ou desmarca uma cor. Com três marcadas, uma quarta não entra. */
export function toggleFurColor(current: readonly FurColor[], color: FurColor): FurColor[] {
  if (current.includes(color)) return current.filter((item) => item !== color);
  if (current.length >= MAX_FUR_COLORS) return [...current];
  return [...current, color];
}

const furLabel = new Map(furColors.map((item) => [item.value, item.label.toLowerCase()]));

/** "caramelo e branco". Cores desconhecidas (de uma API mais nova) ficam de fora. */
export function furColorsText(colors: readonly string[] | undefined): string {
  const names = (colors ?? [])
    .map((color) => furLabel.get(color as FurColor))
    .filter((name): name is string => Boolean(name));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export type MatchStrength = 'high' | 'medium' | 'low';

export interface MatchReason {
  code: string;
  label: string;
  points: number;
  max: number;
}

export interface MatchAnimal {
  id?: string;
  species: string;
  size: string;
  sex: string | null;
  name: string | null;
  colors: string[];
}

export interface LostMatch {
  id: string;
  score: number;
  strength: MatchStrength;
  reasons: MatchReason[];
  distanceKm: number;
  status: 'suggested' | 'confirmed' | 'dismissed';
  createdAt: string;
  post: {
    id: string;
    type: string;
    status: string;
    approxLabel: string;
    createdAt: string;
    description: string;
    animal: MatchAnimal;
    author: { name: string; handle: string };
    photo: { url: string; thumbUrl: string } | null;
  };
}

export interface MatchList {
  side: 'lost' | 'found' | null;
  searching: boolean;
  matches: LostMatch[];
}

export interface LostSearchResult {
  score: number;
  strength: MatchStrength;
  reasons: MatchReason[];
  distanceKm: number;
  post: {
    id: string;
    approxLabel: string;
    createdAt: string;
    description: string;
    animal: MatchAnimal;
    photo: { url: string; thumbUrl: string } | null;
  };
}

export const strengthLabel: Record<MatchStrength, string> = {
  high: 'Muito parecido',
  medium: 'Parecido',
  low: 'Talvez',
};

/** "a 1,5 km" ou "a menos de 1 km". */
export function distanceText(km: number): string {
  if (km < 1) return 'a menos de 1 km';
  return `a ${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

/** Motivos que pesaram a favor primeiro; os que pesaram contra por último. */
export function sortedReasons(reasons: readonly MatchReason[]): MatchReason[] {
  return [...reasons]
    .filter((reason) => reason.code !== 'species')
    .sort((a, b) => Number(b.points > 0) - Number(a.points > 0) || b.points - a.points);
}

export interface LostSearchForm {
  species: 'dog' | 'cat' | 'other';
  size: 'small' | 'medium' | 'large' | null;
  sex: 'male' | 'female' | null;
  colors: readonly FurColor[];
  text: string;
  latitude: number;
  longitude: number;
}

/** Endereço de GET /lost-search. Campos vazios ficam de fora para não pesar na nota. */
export function lostSearchPath(form: LostSearchForm): string {
  const params = new URLSearchParams({
    species: form.species,
    latitude: form.latitude.toFixed(5),
    longitude: form.longitude.toFixed(5),
  });
  if (form.size) params.set('size', form.size);
  if (form.sex) params.set('sex', form.sex);
  if (form.colors.length > 0) params.set('colors', form.colors.join(','));
  const text = form.text.trim();
  if (text) params.set('text', text.slice(0, 300));
  return `/lost-search?${params.toString()}`;
}

/**
 * Cartaz do post. Abre pela página de download (HTTPS), que repassa `/api/` para a API, então
 * funciona no WhatsApp e no navegador de quem recebe.
 */
export function posterLink(downloadPage: string, postId: string): string {
  return `${downloadPage.replace(/\/+$/, '')}/api/posts/${encodeURIComponent(postId)}/poster`;
}

export function posterShareMessage(
  subject: { lost: boolean; name: string | null; species: string; place: string },
  link: string,
): string {
  const ref = subject.name?.trim() || subject.species.toLowerCase();
  const where = subject.place ? ` em ${subject.place}` : '';
  const headline = subject.lost
    ? `🚨 PROCURA-SE: ${ref} sumiu${where}. Se você viu, abra o cartaz e avise pelo app.`
    : `🐾 Encontrado${where}: ${ref}. Reconhece? Abra o cartaz e fale pelo app.`;
  return `${headline}\n\n${link}\n\nCompartilhe nos grupos do bairro. Ninguém deve pedir dinheiro pelo animal.`;
}
