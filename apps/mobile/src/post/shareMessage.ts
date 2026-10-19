// Texto e link do compartilhamento de um post. Sem React Native, para rodar no teste em Node.

export interface ShareSubject {
  id: string;
  status: string;
  /** Nome digitado no cadastro; vazio quando o animal não tem nome. */
  name: string | null | undefined;
  /** "Cachorro", "Gato"... */
  species: string;
  /** Bairro ou rua, sem a cidade. */
  place: string;
}

/**
 * O link vai para a página de download, que já existe em todo APK. Com o `?post=` ela oferece
 * abrir este post no app e, para quem não tem o app, baixar.
 */
export function postShareLink(downloadPage: string, postId: string): string {
  return `${downloadPage.replace(/\/+$/, '')}/?post=${encodeURIComponent(postId)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function postShareMessage(subject: ShareSubject, link: string): string {
  const name = subject.name?.trim();
  // "a Mel" soa errado sem saber o sexo, então vai o nome sozinho ou "um gato".
  const ref = name || `um ${subject.species.toLowerCase()}`;
  const where = subject.place ? ` em ${subject.place}` : '';
  let headline: string;
  switch (subject.status) {
    case 'for_adoption':
      headline = `🐾 ${capitalize(ref)} procura um lar${where}! Veja as fotos e fale com quem cuida pelo Égua, adota!`;
      break;
    case 'adopted':
      headline = `🏡 ${capitalize(ref)} ganhou um lar${where}! Veja a história no Égua, adota!`;
      break;
    case 'open':
    case 'on_the_way':
    case 'not_found':
      headline = `🚨 ${capitalize(ref)} precisa de resgate${where}. Ajude pelo Égua, adota!`;
      break;
    default:
      headline = `🐾 Acompanhe a história de ${ref}${where} no Égua, adota!`;
  }
  return `${headline}\n\n${link}\n\nToque no link para abrir no app ou baixar grátis.`;
}
