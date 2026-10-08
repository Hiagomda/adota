export type Vocative = 'mano' | 'mana' | 'mano(a)';

const masculine = new Set([
  'joao',
  'jose',
  'luis',
  'luiz',
  'andre',
  'felipe',
  'filipe',
  'jorge',
  'henrique',
  'vicente',
  'carlos',
  'marcos',
  'lucas',
  'matheus',
  'mateus',
  'gabriel',
  'daniel',
  'rafael',
  'miguel',
  'samuel',
  'davi',
  'heitor',
  'enzo',
  'arthur',
  'antonio',
  'francisco',
  'luca',
  'josue',
  'moises',
  'noah',
  'elias',
  'tomas',
  'thomas',
  'isaac',
  'igor',
  'cesar',
  'alex',
  'vinicius',
  'nicolas',
]);

const feminine = new Set([
  'beatriz',
  'alice',
  'raquel',
  'isabel',
  'isabelle',
  'isis',
  'iris',
  'ester',
  'esther',
  'rute',
  'ruth',
  'noemi',
  'naomi',
  'ingrid',
  'yasmin',
  'yasmim',
  'miriam',
  'karen',
  'helen',
  'carmen',
  'nicole',
  'carol',
  'caroline',
  'michelle',
  'michele',
  'rachel',
  'sol',
]);

function firstName(fullName: string): string {
  const token = fullName.trim().split(/\s+/)[0] ?? '';
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function vocativeFromName(fullName: string | null | undefined): Vocative {
  if (!fullName?.trim()) return 'mano(a)';
  const name = firstName(fullName);
  if (!name) return 'mano(a)';
  if (feminine.has(name)) return 'mana';
  if (masculine.has(name)) return 'mano';
  if (name.endsWith('a')) return 'mana';
  if (name.endsWith('o')) return 'mano';
  return 'mano(a)';
}
