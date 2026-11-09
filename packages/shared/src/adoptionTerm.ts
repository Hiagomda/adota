import { z } from 'zod';

/**
 * Termo de adoção responsável. Quem adota lê e aceita no app depois que o animal é marcado como
 * adotado; o texto aceito fica guardado como foi lido. Se quem entrega é ONG ou protetor
 * verificado e escreveu o próprio termo no painel, vale o dele; senão vale o termo do app,
 * escrito no modelo dos termos usados pelas ONGs (cuidados, castração, não repassar, devolver a
 * quem entregou, acompanhamento e a lei de maus-tratos).
 */

/** Tamanho do termo próprio da ONG. Abaixo disso não é um termo; acima, ninguém lê no celular. */
export const ORG_TERM_MIN = 200;
export const ORG_TERM_MAX = 8000;

/** Campos que o texto pode usar e o app troca na hora de mostrar. */
export const TERM_FIELDS = {
  adotante: 'nome de quem adota',
  animal: 'nome do animal',
  quem_entrega: 'nome da ONG ou de quem entrega',
  data: 'data de hoje',
} as const;
export type TermField = keyof typeof TERM_FIELDS;

export interface TermAnimal {
  name: string | null;
  species: string;
  sex: string | null;
  neutered: boolean | null;
}

export interface TermContext {
  /** Nome completo digitado no aceite; antes disso, o nome da conta ou um espaço em branco. */
  adopter: string | null;
  /** Quem entrega: nome da ONG verificada ou o nome de quem publicou. */
  giver: string;
  animal: TermAnimal;
  date: Date;
}

export const orgTermSchema = z
  .object({
    /** null volta para o termo do app. */
    body: z.string().trim().min(ORG_TERM_MIN).max(ORG_TERM_MAX).nullable(),
    /** A ONG pede CPF e endereço no aceite. */
    requireIdentity: z.boolean().default(false),
  })
  .strict();
export type OrgTermInput = z.infer<typeof orgTermSchema>;

/** CPF com ou sem pontuação. Só confere o formato e os dígitos verificadores. */
export function validCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

export function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export const termAcceptSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(5, 'Escreva seu nome completo.')
      .max(120)
      .refine((name) => name.split(/\s+/).length >= 2, 'Escreva nome e sobrenome.'),
    cpf: z
      .string()
      .trim()
      .max(20)
      .optional()
      .refine((cpf) => !cpf || validCpf(cpf), 'Esse CPF não parece certo. Confira os números.'),
    address: z.string().trim().max(240).optional(),
    agree: z.literal(true, { errorMap: () => ({ message: 'Marque que você leu e concorda.' }) }),
  })
  .strict();
export type TermAcceptInput = z.infer<typeof termAcceptSchema>;

function speciesWord(animal: TermAnimal): string {
  const female = animal.sex === 'female';
  if (animal.species === 'dog') return female ? 'a cadela' : 'o cão';
  if (animal.species === 'cat') return female ? 'a gata' : 'o gato';
  return 'o animal';
}

/** "Mel, a cadela" ou só "o gato" quando não tem nome. */
export function animalForTerm(animal: TermAnimal): string {
  const name = animal.name?.trim();
  return name ? `${name} (${speciesWord(animal).replace(/^(o|a) /, '')})` : speciesWord(animal);
}

export function termDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Belem',
  });
}

const BLANK = '____________________';

/** Troca {adotante}, {animal}, {quem_entrega} e {data}. Chaves desconhecidas ficam como estão. */
export function fillTerm(template: string, context: TermContext): string {
  const values: Record<TermField, string> = {
    adotante: context.adopter?.trim() || BLANK,
    animal: animalForTerm(context.animal),
    quem_entrega: context.giver.trim() || 'quem entregou o animal',
    data: termDate(context.date),
  };
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? values[key as TermField] : whole,
  );
}

/**
 * O termo do app, com cláusulas que mudam conforme o animal: castração só se ainda não for
 * castrado, telas para gatos, nada de corrente para cães. Usa os mesmos campos do termo da ONG,
 * para a ONG poder começar dele.
 */
export function defaultTermTemplate(animal: Pick<TermAnimal, 'species' | 'neutered'>): string {
  const clauses: string[] = [
    'Oferecer abrigo protegido do sol, da chuva e do frio, água limpa à vontade e alimentação de qualidade todos os dias.',
    'Levar ao veterinário sempre que precisar e manter as vacinas (incluindo a antirrábica, todo ano) e o vermífugo em dia.',
  ];
  if (animal.neutered === true) {
    clauses.push('Manter o animal castrado, como foi entregue.');
  } else {
    clauses.push(
      'Castrar o animal em até 60 dias depois da adoção, ou quando atingir a idade indicada pelo veterinário se ainda for filhote, e avisar {quem_entrega} quando a castração for feita.',
    );
  }
  if (animal.species === 'dog') {
    clauses.push(
      'Não manter o cão preso em corrente ou corda, nem solto na rua sem supervisão. Passear com coleira e guia.',
    );
  }
  if (animal.species === 'cat') {
    clauses.push(
      'Manter o gato dentro de casa, com telas de proteção em janelas, sacadas e varandas, sem acesso livre à rua.',
    );
  }
  clauses.push(
    'Usar coleira ou plaquinha com identificação e um telefone de contato.',
    'Não abandonar, não vender, não trocar e não doar o animal a outra pessoa sem combinar antes com {quem_entrega}.',
    'Se um dia não puder mais ficar com o animal, devolvê-lo a {quem_entrega}, que vai buscar um novo lar.',
    'Avisar {quem_entrega} em caso de fuga, perda, doença grave ou morte do animal.',
    'Responder ao acompanhamento da adoção no app (aos 7, 30 e 90 dias) e aceitar contato ou visita combinada de {quem_entrega} para saber como o animal está.',
    'Avisar se mudar de endereço ou de telefone.',
  );
  const numbered = clauses.map((clause, index) => `${index + 1}. ${clause}`).join('\n');
  return [
    'TERMO DE ADOÇÃO RESPONSÁVEL',
    '',
    'Eu, {adotante}, declaro que adoto {animal}, entregue por {quem_entrega}, e assumo a responsabilidade pelos cuidados dele por toda a vida. Eu me comprometo a:',
    '',
    numbered,
    '',
    'Declaro que sou maior de 18 anos, que as pessoas da minha casa concordam com a adoção e que as informações que dei na ficha de adoção são verdadeiras.',
    '',
    'Estou ciente de que abandono e maus-tratos a animais são crime (Lei 9.605/1998, art. 32). Para cães e gatos a pena é de 2 a 5 anos de reclusão, multa e proibição da guarda (Lei 14.064/2020).',
    '',
    'Este termo foi aceito pelo app Égua, adota! em {data}.',
  ].join('\n');
}
