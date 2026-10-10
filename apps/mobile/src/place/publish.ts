import { File, UploadType } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { z } from 'zod';
import { ApiError, api, isNetworkError } from '../api';
import type { MapPoint } from '../map/geo';

export const alertDraftSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  photos: z.array(z.string().min(1)).min(1).max(5),
  description: z.string().min(1),
  kind: z.enum(['rescue_alert', 'lost']),
  species: z.enum(['dog', 'cat', 'other']),
  urgency: z.enum(['low', 'medium', 'high']),
  point: z.object({ latitude: z.number(), longitude: z.number() }),
  accuracyM: z.number().nullable(),
  addressText: z.string().nullable(),
  referencePoint: z.string(),
  approxLabel: z.string().min(1),
});

export type AlertDraft = z.infer<typeof alertDraftSchema> & { point: MapPoint };

const presignSchema = z.object({
  uploads: z.array(z.object({ key: z.string().min(1), uploadUrl: z.string().min(1) })).min(1),
});

const createdSchema = z.object({ id: z.string().min(1), reviewStatus: z.string() });

/** Photo uploads on a weak connection need longer than a JSON call. */
const uploadTimeoutMs = 60_000;

interface PreparedPhoto {
  uri: string;
  bytes: number;
}

const preparing = new Map<string, Promise<PreparedPhoto>>();

async function compressPhoto(uri: string): Promise<PreparedPhoto> {
  const compressed = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const file = new File(compressed.uri);
  const bytes = file.size ?? 0;
  if (bytes <= 0) throw new ApiError(0, 'Não consegui ler a foto. Tente de novo.');
  return { uri: compressed.uri, bytes };
}

function preparedPhoto(uri: string): Promise<PreparedPhoto> {
  const existing = preparing.get(uri);
  if (existing) return existing;
  const next = compressPhoto(uri).catch((error: unknown) => {
    preparing.delete(uri);
    throw error;
  });
  preparing.set(uri, next);
  return next;
}

/** Shrink the picture while the person is still writing, so Publicar does not wait on it. */
export function preparePhoto(uri: string): void {
  void preparedPhoto(uri).catch(() => undefined);
}

async function putPhoto(uri: string, url: string): Promise<void> {
  const file = new File(uri);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), uploadTimeoutMs);
  try {
    const put = await file.upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'content-type': 'image/jpeg' },
      signal: controller.signal,
    });
    if (put.status < 200 || put.status >= 300) {
      throw new ApiError(put.status, 'Não consegui enviar a foto. Tente de novo.');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, 'A conexão demorou demais. Tente de novo.', 'timeout');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.', 'offline');
  } finally {
    clearTimeout(timer);
  }
}

/** True only when the request never reached the server or timed out: safe to queue and retry. */
export function isOfflineError(error: unknown): boolean {
  return isNetworkError(error);
}

/** Uploads one picture and returns the storage key the API can turn into a public photo. */
export async function uploadProfilePhoto(token: string, uri: string): Promise<string> {
  const photo = await preparedPhoto(uri);
  const signed = await api('/uploads/presign', {
    method: 'POST',
    token,
    body: { files: [{ contentType: 'image/jpeg', bytes: photo.bytes }] },
    schema: presignSchema,
  });
  const upload = signed.uploads[0];
  if (!upload) throw new ApiError(502, 'Sem endereço de envio para a foto.', 'invalid_response');
  await putPhoto(photo.uri, upload.uploadUrl);
  return upload.key;
}

export async function publishAlert(
  draft: AlertDraft,
): Promise<{ id: string; reviewStatus: string }> {
  const photos = await Promise.all(draft.photos.map((photo) => preparedPhoto(photo)));
  const signed = await api('/uploads/presign', {
    method: 'POST',
    token: draft.token,
    body: { files: photos.map((photo) => ({ contentType: 'image/jpeg', bytes: photo.bytes })) },
    schema: presignSchema,
  });
  if (signed.uploads.length !== photos.length) {
    throw new ApiError(502, 'Sem endereço de envio para a foto.', 'invalid_response');
  }
  const media = await Promise.all(
    photos.map(async (photo, index) => {
      const upload = signed.uploads[index];
      if (!upload)
        throw new ApiError(502, 'Sem endereço de envio para a foto.', 'invalid_response');
      await putPhoto(photo.uri, upload.uploadUrl);
      return { url: upload.key };
    }),
  );
  return api('/posts', {
    method: 'POST',
    token: draft.token,
    schema: createdSchema,
    body: {
      type: draft.kind,
      species: draft.species,
      size: 'medium',
      urgency: draft.urgency,
      description: draft.description,
      latitude: draft.point.latitude,
      longitude: draft.point.longitude,
      accuracyM: draft.accuracyM ?? undefined,
      addressText: draft.addressText ?? undefined,
      referencePoint: draft.referencePoint.trim() || undefined,
      approxLabel: draft.approxLabel,
      media,
    },
  });
}
