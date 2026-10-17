import { requireOptionalNativeModule } from 'expo';

interface PhotoShareModule {
  share(imageUri: string, mimeType: string, text: string, title: string): Promise<void>;
}

/** Só existe no Android. No iOS o Share do React Native já manda foto e texto juntos. */
export const PhotoShare = requireOptionalNativeModule<PhotoShareModule>('PhotoShare');
