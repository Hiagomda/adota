import { Share } from 'react-native';
import { neighborhoodOf, speciesLabel } from '../animalLabels';
import type { Post } from '../types';
import { downloadPageUrl } from '../updates/checkForAppUpdate';
import { posterLink, posterShareMessage } from './lostMatch';

/** Manda o link do cartaz digital (abre no navegador, dá para imprimir ou salvar em PDF). */
export async function sharePoster(post: Post): Promise<void> {
  const link = posterLink(downloadPageUrl, post.id);
  const message = posterShareMessage(
    {
      lost: post.type === 'lost',
      name: post.animal.name,
      species: speciesLabel[post.animal.species] ?? 'Bichinho',
      place: neighborhoodOf(post.approxLabel),
    },
    link,
  );
  await Share.share({ message, title: 'Cartaz' }, { dialogTitle: 'Compartilhar o cartaz' });
}
