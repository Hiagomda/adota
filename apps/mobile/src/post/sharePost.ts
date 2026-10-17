import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform, Share } from 'react-native';
import { PhotoShare } from '../../modules/photo-share';
import { neighborhoodOf, speciesLabel } from '../animalLabels';
import { logBestEffort } from '../crash/bestEffort';
import type { Post } from '../types';
import { downloadPageUrl } from '../updates/checkForAppUpdate';
import { postShareLink, postShareMessage } from './shareMessage';

const SHARE_TITLE = 'Compartilhar no...';

/**
 * Baixa a primeira foto para o cache e regrava em JPEG. O imgproxy entrega WebP, que o WhatsApp
 * pode tratar como figurinha; JPEG chega como foto em qualquer app.
 */
async function photoForSharing(url: string): Promise<File> {
  const directory = new Directory(Paths.cache, 'share');
  if (!directory.exists) directory.create();
  const original = await File.downloadFileAsync(url, new File(directory, 'original'), {
    idempotent: true,
  });
  const jpeg = await ImageManipulator.manipulateAsync(original.uri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return new File(jpeg.uri);
}

/** Link de um post que abre no app ou leva ao download. Também vai nas mensagens de WhatsApp. */
export function postLinkFor(postId: string): string {
  return postShareLink(downloadPageUrl, postId);
}

/**
 * Abre o compartilhamento com a foto do animal e o texto com o link clicável. Sem foto, ou se a
 * foto não baixar, compartilha só o texto: o link continua levando ao post ou ao download.
 */
export async function sharePost(post: Post): Promise<void> {
  const link = postLinkFor(post.id);
  const message = postShareMessage(
    {
      id: post.id,
      status: post.status,
      name: post.animal.name,
      species: speciesLabel[post.animal.species] ?? 'bichinho',
      place: neighborhoodOf(post.approxLabel),
    },
    link,
  );
  const photoUrl = post.media[0]?.url;
  if (photoUrl && Platform.OS !== 'web') {
    const photo = await photoForSharing(photoUrl).catch(logBestEffort('share:photo'));
    if (photo) {
      if (Platform.OS === 'android' && PhotoShare) {
        await PhotoShare.share(photo.contentUri, 'image/jpeg', message, SHARE_TITLE);
        return;
      }
      if (Platform.OS === 'ios') {
        // No iOS o Share do React Native manda o arquivo de `url` junto com a mensagem.
        await Share.share({ message, url: photo.uri });
        return;
      }
    }
  }
  await Share.share({ message, title: SHARE_TITLE }, { dialogTitle: SHARE_TITLE });
}
