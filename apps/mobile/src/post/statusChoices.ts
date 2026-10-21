/**
 * Para onde o animal pode ir a partir de cada passo, dito como a pessoa diria. Sem import de React
 * Native, para rodar no node:test. O servidor valida as mesmas regras em @patinha/shared
 * (statusTransitions, ownerOnlyStatus e selfAdoption).
 */

export interface StatusChoice {
  status: 'rescued' | 'fostered' | 'for_adoption' | 'adopted';
  title: string;
  body: string;
  /** Nome de ícone do Feather. */
  icon: 'shield' | 'home' | 'heart' | 'star' | 'pause-circle' | 'rotate-ccw';
}

const keepSafe: StatusChoice = {
  status: 'rescued',
  title: 'Está comigo, ainda vou decidir',
  body: 'Ele sai da rua e fica com você enquanto pensa no próximo passo.',
  icon: 'shield',
};

const fosterFound: StatusChoice = {
  status: 'fostered',
  title: 'Está comigo em lar temporário',
  body: 'Você cuida dele até achar um lar. Pode colocar para adoção quando quiser.',
  icon: 'home',
};

const fosterLater: StatusChoice = {
  status: 'fostered',
  title: 'Foi para um lar temporário',
  body: 'Com você, com uma Casa Amiga ou com alguém que se ofereceu.',
  icon: 'home',
};

const offerFound: StatusChoice = {
  status: 'for_adoption',
  title: 'Já pode ser adotado',
  body: 'Entra na lista de adoção e quem quer adotar pode te chamar.',
  icon: 'heart',
};

const offerLater: StatusChoice = {
  status: 'for_adoption',
  title: 'Colocar para adoção',
  body: 'Entra na lista de adoção e quem quer adotar pode te chamar.',
  icon: 'heart',
};

const keepForever: StatusChoice = {
  status: 'adopted',
  title: 'Decidi adotar',
  body: 'Ele fica com você para sempre e o resgate termina como Adotado.',
  icon: 'star',
};

const fosterKeeps: StatusChoice = {
  status: 'adopted',
  title: 'Decidi ficar com ele',
  body: 'O lar temporário virou casa. O resgate termina como Adotado.',
  icon: 'star',
};

const pauseAdoption: StatusChoice = {
  status: 'fostered',
  title: 'Pausar a adoção',
  body: 'Ele sai da lista e volta para o lar temporário. Dá para reabrir depois.',
  icon: 'pause-circle',
};

const returned: StatusChoice = {
  status: 'for_adoption',
  title: 'Foi devolvido',
  body: 'A adoção não deu certo e ele volta para a lista procurando outro lar.',
  icon: 'rotate-ccw',
};

/**
 * As escolhas de quem pode mexer no resgate. `owner` é o autor ou a equipe; quem só disse "vou
 * ajudar" escolhe a partir de "a caminho" e não pausa a adoção nem registra devolução. "Foi
 * adotado por outra pessoa" tem botão e confirmação próprios, por isso não entra aqui.
 */
export function statusChoices(status: string, owner: boolean): StatusChoice[] {
  switch (status) {
    case 'on_the_way':
      return [keepSafe, fosterFound, offerFound, keepForever];
    case 'open':
    case 'not_found':
      return owner ? [keepSafe, fosterFound, offerFound, keepForever] : [];
    case 'rescued':
      return [fosterLater, offerLater, keepForever];
    case 'fostered':
      return [offerLater, fosterKeeps];
    case 'for_adoption':
      return owner ? [pauseAdoption] : [];
    case 'adopted':
      return owner ? [returned] : [];
    default:
      return [];
  }
}

/** O que aparece depois da escolha, para a pessoa saber que deu certo. */
export function choiceNote(choice: StatusChoice, from: string): string {
  const fromStreet = from === 'open' || from === 'on_the_way' || from === 'not_found';
  switch (choice.status) {
    case 'rescued':
      return 'Égua, que alegria! Conte no diário como ele está.';
    case 'fostered':
      return from === 'for_adoption'
        ? 'Adoção pausada. Ele segue no lar temporário.'
        : 'Ele está num lar temporário. Conte no diário como ele está se adaptando.';
    case 'for_adoption':
      return from === 'adopted'
        ? 'Ele voltou para a lista de adoção. Compartilhe para achar outro lar.'
        : 'Ele está na lista de adoção. Compartilhe para achar um lar.';
    case 'adopted':
      return fromStreet
        ? 'Égua, que alegria! Do resgate direto para a família.'
        : 'Égua, que alegria! Ele achou um lar. Conte no diário como foi.';
  }
}
