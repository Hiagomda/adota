/**
 * Dicas educativas do Cupu. Sem import de React Native, para rodar no node:test. Elas só aparecem
 * em telas calmas (adoção, feiras, sua rede): nunca no meio de um resgate ou de um animal perdido.
 */

export type CupuTipContext = 'adoption' | 'fairs' | 'network';

export interface CupuTip {
  id: string;
  text: string;
}

const tips: Record<CupuTipContext, CupuTip[]> = {
  adoption: [
    {
      id: 'adoption-lifetime',
      text: 'Adotar é pra vida toda: cachorro e gato vivem uns 12 a 15 anos. Pensa nas férias, na mudança e no orçamento antes.',
    },
    {
      id: 'adoption-visit',
      text: 'Combina uma visita antes de levar e vê se o bichinho se dá com quem já mora na tua casa.',
    },
    {
      id: 'adoption-neuter',
      text: 'Castrar evita ninhada na rua e ainda protege contra alguns tipos de câncer.',
    },
    {
      id: 'adoption-adult',
      text: 'Bicho adulto também é amor: já tem o jeito formado e costuma ser mais calmo.',
    },
    {
      id: 'adoption-window',
      text: 'Vai levar um gato pra apartamento? Põe tela nas janelas antes. Queda é um acidente muito comum.',
    },
  ],
  fairs: [
    {
      id: 'fairs-documents',
      text: 'Leva documento com foto e comprovante de residência: muitas feiras pedem na hora de adotar.',
    },
    {
      id: 'fairs-calm',
      text: 'Feira cheia assusta os bichinhos. Chega devagar e deixa ele te cheirar primeiro.',
    },
    {
      id: 'fairs-share',
      text: 'Não dá pra adotar agora? Divulgar a feira pros amigos já ajuda um monte.',
    },
  ],
  network: [
    {
      id: 'network-foster',
      text: 'Lar temporário abre vaga nos abrigos enquanto o bichinho espera uma família.',
    },
    {
      id: 'network-heat',
      text: 'No calor de Belém, uma vasilha de água fresca na sombra já salva o dia de um bicho de rua.',
    },
    {
      id: 'network-scared',
      text: 'Bicho machucado e com medo pode morder. Usa uma toalha, fala baixinho e chama ajuda.',
    },
    {
      id: 'network-closet',
      text: 'Cada ajuda soma XP e libera pose, cenário e enfeite novos pra mim no armário.',
    },
  ],
};

export function tipsFor(context: CupuTipContext): CupuTip[] {
  return tips[context];
}

/** A dica de hoje: muda de um dia pro outro, sem sortear a cada render. */
export function tipIndexForDay(context: CupuTipContext, now: Date): number {
  const day = Math.floor(now.getTime() / DAY_MS);
  return day % tips[context].length;
}

export function nextTipIndex(current: number, length: number): number {
  return length > 0 ? (current + 1) % length : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Quem fecha a dica não vê outra naquela tela por uma semana. */
export const TIP_SNOOZE_MS = 7 * DAY_MS;

/** Lê o "escondido até" salvo; qualquer coisa estranha conta como não escondido. */
export function tipHidden(raw: string | null, now: number): boolean {
  if (raw === null) return false;
  const until = Number(raw);
  return Number.isFinite(until) && until > now;
}
