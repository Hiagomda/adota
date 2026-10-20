/** Listas que mostram resgates. Mudar um resgate deixa todas velhas, não só o feed e o mapa. */
const postLists = [
  ['posts'],
  ['map'],
  ['profile-posts'],
  ['user-posts'],
  ['adoption'],
  ['home-adoption'],
  ['stories'],
  ['similar'],
] as const;

/**
 * As listas a recarregar depois de uma escrita bem-sucedida. Curtir, salvar e ver story ficam de
 * fora: são toques frequentes, já tratados na própria tela, e recarregar tudo a cada um pesaria.
 */
export function listsAfterWrite(method: string, path: string): (readonly string[])[] {
  if (method.toUpperCase() === 'GET') return [];
  const clean = path.split('?')[0] ?? '';
  if (!/^\/posts(\/|$)/.test(clean)) return [];
  if (/\/(like|save|story-view)$/.test(clean)) return [];
  const lists: (readonly string[])[] = [...postLists];
  // Publicar, ir ajudar, desistir e mudar status mexem no XP de quem fez.
  if (clean === '/posts' || /\/(status|responses|help\/leave)$/.test(clean)) {
    lists.push(['volunteer']);
  }
  return lists;
}
