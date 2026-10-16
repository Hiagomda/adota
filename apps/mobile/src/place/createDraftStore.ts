import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { setCreatePhotoCount } from '../createCamera';
import { reportError } from '../crash/reporter';
import { parseCreateForm, worthKeeping, type CreateForm } from './createDraftForm';

const draftKey = '@egua_adota:create_draft';

let primed: CreateForm | null = null;

/** Drops photos the system already cleaned from the cache, so the draft never shows a hole. */
function withLivePhotos(form: CreateForm): CreateForm {
  if (Platform.OS === 'web') return form;
  const photos = form.photos.filter((uri) => {
    try {
      return new File(uri).exists;
    } catch (error) {
      reportError(error, { source: 'handled', where: 'create-draft:photo' });
      return false;
    }
  });
  return { ...form, photos };
}

/** Called once at startup, so the create screen can decide synchronously to skip the camera. */
export async function primeCreateDraft(): Promise<void> {
  try {
    const form = parseCreateForm(await AsyncStorage.getItem(draftKey));
    primed = form ? withLivePhotos(form) : null;
    if (primed && !worthKeeping(primed)) primed = null;
    // With photos waiting, the create tab opens the draft instead of the camera.
    if (primed) setCreatePhotoCount(primed.photos.length);
  } catch (error) {
    reportError(error, { source: 'handled', where: 'create-draft:read' });
    primed = null;
  }
}

/** The draft read at startup, taken once: a second call returns null. */
export function takeCreateDraft(): CreateForm | null {
  const form = primed;
  primed = null;
  return form;
}

export async function saveCreateDraft(form: CreateForm): Promise<void> {
  if (!worthKeeping(form)) {
    await AsyncStorage.removeItem(draftKey);
    return;
  }
  await AsyncStorage.setItem(draftKey, JSON.stringify(form));
}

export async function clearCreateDraft(): Promise<void> {
  primed = null;
  await AsyncStorage.removeItem(draftKey);
}
