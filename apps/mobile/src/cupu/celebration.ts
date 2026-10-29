/** Sem import de React Native, para rodar no node:test. */

export interface CupuCelebrationMoment {
  pose: 'home' | 'party';
  title: string;
  body: string;
}

/** O que o Cupu diz em cada final feliz. Só depois que a tarefa terminou, nunca no meio dela. */
export function celebrationFor(
  status: string,
  type: string | undefined,
): CupuCelebrationMoment | null {
  if (status === 'adopted') {
    return {
      pose: 'home',
      title: 'Adotado!',
      body: 'Égua, que alegria! Mais um bichinho com família. Valeu por fazer parte disso.',
    };
  }
  if (status === 'rescued' && type === 'lost') {
    return {
      pose: 'home',
      title: 'De volta pra casa!',
      body: 'Que alívio! Conta no diário como foi o reencontro.',
    };
  }
  if (status === 'rescued') {
    return {
      pose: 'party',
      title: 'Resgate concluído!',
      body: 'Tiraste mais um da rua. Agora é cuidar, achar lar temporário e depois uma família.',
    };
  }
  if (status === 'fostered') {
    return {
      pose: 'home',
      title: 'Lar temporário garantido!',
      body: 'Ele já tem um cantinho seguro enquanto espera uma família.',
    };
  }
  return null;
}
