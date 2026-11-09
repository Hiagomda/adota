/**
 * Regras e aviso da conversa de adoção. Espelho de `packages/shared/src/chatModeration.ts`
 * (o app não importa o pacote): mude os dois juntos. Sem React Native, para rodar no node:test.
 */

/** Sobe quando o texto do aviso muda de sentido: todo mundo lê e aceita de novo. */
export const chatNoticeVersion = 1;

export const chatNoticePoints = [
  'Esta conversa é só para combinar a adoção do animal.',
  'Para a segurança de todos, as conversas são monitoradas: mensagens com sinais de venda, golpe, ofensa, ameaça, maus-tratos ou assédio vão para a equipe revisar, e a equipe pode ler a conversa inteira quando houver denúncia ou sinal de risco.',
  'Venda de animal e pedido de Pix não são enviados. O app nunca cobra nada na adoção.',
  'Não passe código de verificação, documento, senha ou dados do cartão.',
  'Você pode denunciar ou bloquear a outra pessoa a qualquer momento. Quem quebra as regras pode ter a conta suspensa.',
] as const;

/** Por que alguém denuncia uma conversa. Vai como texto para a equipe ler no painel. */
export const chatReportReasons = [
  'Tentou vender o animal ou pediu Pix',
  'Parece golpe',
  'Ofensa ou ameaça',
  'Assédio',
  'Pediu documento, código ou dados pessoais',
  'Falou em maltratar o animal',
  'Outro problema',
] as const;

/** Primeiras frases para quem quer adotar e não sabe como começar. */
export const adopterStarters = [
  'Oi! Mandei minha ficha. Ele ainda está para adoção?',
  'Como ele é com crianças e outros bichos?',
  'Posso conhecer ele pessoalmente?',
] as const;

/** Linha da lista de conversas: o que a última mensagem diz, com "Você:" quando foi a pessoa. */
export function lastLine(input: { lastBody: string | null; lastMine?: boolean }): string {
  if (!input.lastBody) return 'Conversa aberta';
  return input.lastMine ? `Você: ${input.lastBody}` : input.lastBody;
}
