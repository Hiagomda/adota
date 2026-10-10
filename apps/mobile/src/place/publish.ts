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
    const file = new File(compressed.uri);
    const bytes = file.size ?? 0;
    if (bytes <= 0) throw new ApiError(0, 'Não consegui ler a foto. Tente de novo.');
    const signed = await api('/uploads/presign', {
      method: 'POST',
      token: draft.token,
      body: { files: [{ contentType: 'image/jpeg', bytes }] },
      schema: presignSchema,
    });
    const upload = signed.uploads[0];
    if (!upload) throw new ApiError(502, 'Sem endereço de envio para a foto.', 'invalid_response');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), uploadTimeoutMs);
    let put: { status: number };
    try {
      put = await file.upload(upload.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: { 'content-type': 'image/jpeg' },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'A conexão demorou demais. Tente de novo.', 'timeout');
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.', 'offline');
    } finally {
      clearTimeout(timer);
    }
    if (put.status < 200 || put.status >= 300) {
      throw new ApiError(put.status, 'Não consegui enviar a foto. Tente de novo.');
    }
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
