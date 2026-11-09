/**
 * Moderação da conversa de adoção. Cada mensagem passa por aqui antes de ser gravada:
 * venda e Pix são barrados (o app não vende animal nem recebe dinheiro) e o resto que foge
 * da adoção (golpe, contato fora do app, ofensa, ameaça, maus-tratos, assédio) é entregue,
 * mas marcado para a equipe revisar no painel.
 *
 * A lista é de propósito curta e explicável: ela sinaliza para uma pessoa da equipe olhar,
 * não pune ninguém sozinha. Por isso um falso positivo custa pouco (alguém lê e libera) e um
 * falso negativo ainda tem a denúncia de quem está na conversa.
 */

export const chatFlagKinds = [
  'sale',
  'money',
  'scam',
  'external_contact',
  'offense',
  'threat',
  'abuse',
  'harassment',
] as const;
export type ChatFlag = (typeof chatFlagKinds)[number];

/** Rótulos curtos para o painel e para o aviso de quem escreveu. */
export const chatFlagLabels: Record<ChatFlag, string> = {
  sale: 'Venda de animal',
  money: 'Dinheiro ou pagamento',
  scam: 'Possível golpe',
  external_contact: 'Contato ou dado pessoal',
  offense: 'Ofensa',
  threat: 'Ameaça',
  abuse: 'Maus-tratos',
  harassment: 'Assédio',
};

const leet: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Minúsculas e sem acento. Mantém números e pontuação (servem para achar telefone e link). */
export function plainText(raw: string): string {
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Texto para procurar palavras: troca números por letras ("p1x" vira "pix"), junta letras
 * soltas ("p.i.x" e "p i x" viram "pix") e encolhe letra repetida ("piiiix" vira "pix").
 */
export function wordText(raw: string): string {
  const plain = plainText(raw);
  const swapped = plain.replace(/[0134579@$]/g, (char, offset: number, whole: string) => {
    // Número no meio de número continua número ("R$ 150" não vira "R$ iso").
    const before = whole[offset - 1] ?? '';
    const after = whole[offset + 1] ?? '';
    if (/\d/.test(before) || /\d/.test(after)) return char;
    return leet[char] ?? char;
  });
  const dotted = swapped.replace(/\b[a-z](?:[.\-_*]+[a-z]\b){2,}/g, (run) =>
    run.replace(/[.\-_*]/g, ''),
  );
  // Letras soltas com espaço: "a", "e" e "o" também são palavras, então ficam de fora no começo.
  const joined = dotted.replace(/\b[a-z](?: [a-z]\b){2,}/g, (run) => {
    const letters = run.split(' ');
    if (letters.length > 3 && /^[aeo]$/.test(letters[0] ?? '')) {
      return `${letters[0]} ${letters.slice(1).join('')}`;
    }
    return letters.join('');
  });
  return joined.replace(/([a-z])\1{2,}/g, '$1');
}

interface Rule {
  flag: ChatFlag;
  pattern: RegExp;
  /** Barra a mensagem: venda e Pix nem chegam à outra pessoa. */
  block?: true;
}

const animal =
  '(?:o|a|um|uma|esse|essa|este|esta|meu|minha|filhot\\w*|cachorr\\w*|gat\\w*|cao|caes|bicho|pet)';

/** Procuradas no texto de palavras (`wordText`). */
const wordRules: Rule[] = [
  // Venda: barrada. "Vendo" sozinho é "estou vendo", então só conta com o animal logo depois.
  { flag: 'sale', pattern: new RegExp(`\\bvend(?:o|e|emos|endo)\\s+${animal}\\b`), block: true },
  {
    flag: 'sale',
    pattern: new RegExp(`\\bvender\\s+(?:ele|ela|eles|elas|${animal})\\b`),
    block: true,
  },
  { flag: 'sale', pattern: /\b(?:a|para|pra)\s+venda\b/, block: true },
  { flag: 'sale', pattern: /\bpreco\b/, block: true },
  {
    flag: 'sale',
    pattern:
      /\bquanto\s+(?:custa|cobra|voce\s+cobra|vc\s+cobra|sai\s+ele|sai\s+ela|e\s+ele|e\s+ela)\b/,
    block: true,
  },
  {
    flag: 'sale',
    pattern: /\bvalor\s+(?:dele|dela|do\s+filhote|da\s+filhote|do\s+animal)\b/,
    block: true,
  },
  { flag: 'sale', pattern: /\btaxa\s+de\s+(?:adocao|entrega|envio|reserva)\b/, block: true },
  // Pix: o app nunca recebe dinheiro e Pix só aparece em pedido de ajuda de perfil verificado.
  { flag: 'money', pattern: /\b(?:pix|chave\s+pix)\b/, block: true },

  // Dinheiro em geral: pode ser inocente ("paguei a vacina"), então só sinaliza.
  {
    flag: 'money',
    pattern:
      /\b(?:pagamento|pagar|paga|deposito|depositar|transferencia|transferir|dinheiro|grana|boleto|ted|picpay|mercado\s*pago|nubank|conta\s+bancaria|agencia\s+e\s+conta)\b/,
  },

  // Golpes conhecidos: código do WhatsApp, frete do filhote, link para clicar, documento.
  {
    flag: 'scam',
    pattern:
      /\bcodigo\s+(?:de\s+)?(?:verificacao|confirmacao|seguranca|que\s+chegou|do\s+whats\w*|do\s+zap|de\s+6)\b/,
  },
  { flag: 'scam', pattern: /\b(?:me\s+)?(?:passa|manda|envia|fala)\s+(?:o|esse)\s+codigo\b/ },
  {
    flag: 'scam',
    pattern: /\b(?:frete|transportadora|caixa\s+de\s+transporte\s+paga|seguro\s+do\s+animal)\b/,
  },
  {
    flag: 'scam',
    pattern: /\b(?:clica|clique|clicar|acessa|acesse)\s+(?:no|nesse|neste|o|esse)\s+link\b/,
  },
  {
    flag: 'scam',
    pattern:
      /\b(?:cpf|rg|senha|cartao\s+de\s+credito|numero\s+do\s+cartao|foto\s+do\s+documento|sorteio|premio|premiado)\b/,
  },

  // Levar a conversa para fora do app.
  {
    flag: 'external_contact',
    pattern: /\b(?:whats\w*|zap\w*|wpp|wa\.me|telegram|insta|instagram|facebook|tiktok|signal)\b/,
  },
  {
    flag: 'external_contact',
    pattern:
      /\b(?:me\s+(?:chama|liga|add|adiciona)|meu\s+(?:numero|telefone|celular|contato|endereco)|manda\s+(?:seu|teu)\s+(?:numero|telefone|contato|endereco))\b/,
  },

  // Ofensa e palavrão.
  {
    flag: 'offense',
    pattern:
      /\b(?:idiota|imbecil|otari[oa]|burr[oa]|retardad[oa]|lixo|vagabund[oa]|nojent[oa]|desgracad[oa]|arrombad[oa]|babaca|escrot[oa]|fdp|filh[oa]\s+da\s+puta|puta|porra|caralho|merda|cuzao|corno|vadia|piranha|vsf|vai\s+se\s+f\w+|vtnc|tnc|pqp)\b/,
  },

  // Ameaça a pessoa.
  {
    flag: 'threat',
    pattern: /\b(?:vou|vamos|vo)\s+te\s+(?:matar|pegar|achar|bater|quebrar|furar)\b/,
  },
  { flag: 'threat', pattern: /\bte\s+(?:mato|pego|quebro|furo)\b/ },
  { flag: 'threat', pattern: /\b(?:sei|descobri)\s+onde\s+(?:voce|vc|tu)\s+mora\b/ },
  { flag: 'threat', pattern: /\bvai\s+se\s+arrepender\b/ },

  // Maus-tratos, rinha e cria para vender.
  {
    flag: 'abuse',
    pattern:
      /\b(?:matar|envenenar|sacrificar|afogar|sumir\s+com|jogar\s+(?:fora|na\s+rua)|soltar\s+na\s+rua|abandonar)\s+(?:ele|ela|eles|elas|o\s+\w+|a\s+\w+|esse|essa|os\s+filhotes)\b/,
  },
  { flag: 'abuse', pattern: /\b(?:rinha|briga\s+de\s+(?:cachorro|galo|caes)|chumbinho|veneno)\b/ },
  { flag: 'abuse', pattern: /\bcruza(?:r)?\s+(?:ele|ela|com\s+(?:outr|meu|minha|um|uma)\w*)\b/ },
  { flag: 'abuse', pattern: /\b(?:procriar|tirar\s+cria|ninhada\s+para\s+vend\w*|para\s+cria)\b/ },

  // Assédio.
  {
    flag: 'harassment',
    pattern:
      /\b(?:nudes?|nud|pelad[oa]|gostos[oa]|sexo|transar|safad[oa]|manda\s+(?:uma\s+)?foto\s+(?:sua|tua)|namorar\s+comigo|ficar\s+comigo|sair\s+comigo)\b/,
  },
];

/** Procuradas no texto sem troca de número (`plainText`). */
const plainRules: Rule[] = [
  // Valor em dinheiro: "R$ 200", "200 reais", "200 conto".
  {
    flag: 'sale',
    pattern: /r\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:reais|conto|pila|mil\s+reais)\b/,
    block: true,
  },
  // Link, e-mail e @ de rede social.
  {
    flag: 'external_contact',
    pattern: /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|me|ly|io|site|br)(?:\b|\/)/,
  },
  { flag: 'external_contact', pattern: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/ },
  { flag: 'external_contact', pattern: /(?:^|\s)@[a-z0-9_.]{3,}/ },
];

/** Oito dígitos ou mais com espaço, ponto, traço ou parêntese entre eles: telefone. */
function hasPhoneNumber(plain: string): boolean {
  const runs = plain.match(/\+?\(?\d[\d\s.\-()]{6,}\d/g) ?? [];
  return runs.some((run) => run.replace(/\D/g, '').length >= 8);
}

export interface ChatScan {
  /** Categorias encontradas, sem repetição, na ordem de `chatFlagKinds`. */
  flags: ChatFlag[];
  /** Verdadeiro quando a mensagem não pode ser entregue. */
  blocked: boolean;
}

export function scanChatMessage(raw: string): ChatScan {
  const plain = plainText(raw);
  const words = wordText(raw);
  const found = new Set<ChatFlag>();
  let blocked = false;
  const check = (rule: Rule, text: string) => {
    if (!rule.pattern.test(text)) return;
    found.add(rule.flag);
    if (rule.block) blocked = true;
  };
  for (const rule of wordRules) check(rule, words);
  for (const rule of plainRules) check(rule, plain);
  if (hasPhoneNumber(plain)) found.add('external_contact');
  return { flags: chatFlagKinds.filter((flag) => found.has(flag)), blocked };
}

/**
 * Dica para quem escreveu, quando a mensagem foi entregue mas sinalizada. Não acusa ninguém:
 * explica a regra e lembra que a equipe acompanha.
 */
export function chatFlagTip(flags: readonly ChatFlag[]): string | null {
  if (flags.includes('threat') || flags.includes('harassment') || flags.includes('offense')) {
    return 'Essa mensagem foi enviada para a equipe revisar. Ofensa, ameaça ou assédio levam à suspensão da conta.';
  }
  if (flags.includes('abuse')) {
    return 'Essa mensagem foi enviada para a equipe revisar. Maus-tratos são crime (Lei 9.605/98).';
  }
  if (flags.includes('scam') || flags.includes('money')) {
    return 'Cuidado: o app não cobra nada na adoção. Nunca pague frete, taxa ou reserva e nunca passe código que chegou por SMS.';
  }
  if (flags.includes('external_contact')) {
    return 'Dica: combine a visita por aqui antes de passar telefone ou endereço. Fora do app a equipe não consegue ajudar.';
  }
  return null;
}

/** Os textos do aviso que a pessoa lê e aceita antes da primeira mensagem. */
export const chatNoticeVersion = 1;
export const chatNoticePoints = [
  'Esta conversa é só para combinar a adoção do animal.',
  'Para a segurança de todos, as conversas são monitoradas: mensagens com sinais de venda, golpe, ofensa, ameaça, maus-tratos ou assédio vão para a equipe revisar, e a equipe pode ler a conversa inteira quando houver denúncia ou sinal de risco.',
  'Venda de animal e pedido de Pix não são enviados. O app nunca cobra nada na adoção.',
  'Não passe código de verificação, documento, senha ou dados do cartão.',
  'Você pode denunciar ou bloquear a outra pessoa a qualquer momento. Quem quebra as regras pode ter a conta suspensa.',
] as const;
