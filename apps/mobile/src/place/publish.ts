import * as ImageManipulator from 'expo-image-manipulator';
import { z } from 'zod';
import { ApiError, api, fetchWithTimeout, isNetworkError } from '../api';
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

/** True only when the request never reached the server or timed out: safe to queue and retry. */
export function isOfflineError(error: unknown): boolean {
  return isNetworkError(error);
}

export async function publishAlert(draft: AlertDraft): Promise<{ id: string; reviewStatus: string }> {
  const media: { url: string }[] = [];
  for (const photo of draft.photos) {
    const compressed = await ImageManipulator.manipulateAsync(photo, [{ resize: { width: 1080 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    // Local file read: a failure here is a missing file, never the network.
    const file = await fetch(compressed.uri);
    const blob = await file.blob();
    const signed = await api('/uploads/presign', {
      method: 'POST',
      token: draft.token,
      body: { files: [{ contentType: 'image/jpeg', bytes: blob.size }] },
      schema: presignSchema,
    });
    const upload = signed.uploads[0];
    if (!upload) throw new ApiError(502, 'Sem endereço de envio para a foto.', 'invalid_response');
    const put = await fetchWithTimeout(
      upload.uploadUrl,
      { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob },
      uploadTimeoutMs,
    );
    if (!put.ok) throw new ApiError(put.status, 'Não consegui enviar a foto. Tente de novo.');
    media.push({ url: upload.key });
  }
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
