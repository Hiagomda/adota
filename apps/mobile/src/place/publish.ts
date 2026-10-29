import * as ImageManipulator from 'expo-image-manipulator';
import { z } from 'zod';
import { ApiError, api, isNetworkError } from '../api';
import type { MapPoint } from '../map/geo';
import { logBestEffort } from '../crash/bestEffort';
import { photoBytes, putPhotoFile } from './photoFile';

export const alertDraftSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  photos: z.array(z.string().min(1)).min(1).max(5),
  description: z.string().min(1),
  kind: z.enum(['rescue_alert', 'lost', 'adoption', 'help_request']),
  species: z.enum(['dog', 'cat', 'other']),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  // Rascunhos da fila offline gravados antes das cores não têm o campo.
  colors: z
    .array(z.enum(['black', 'white', 'gray', 'brown', 'caramel', 'ginger', 'cream', 'brindle']))
    .max(3)
    .optional(),
  sex: z.enum(['male', 'female', 'unknown']).default('unknown'),
  name: z.string().trim().max(80).optional().default(''),
  ageEstimate: z.enum(['filhote', 'adulto', 'idoso']).optional(),
  care: z
    .object({
      neutered: z.boolean().optional(),
      vaccinated: z.boolean().optional(),
      goodWithKids: z.boolean().optional(),
      goodWithAnimals: z.boolean().optional(),
    })
    .optional(),
  urgency: z.enum(['low', 'medium', 'high']),
  helpRequest: z
    .object({
      kind: z.enum(['food', 'vet', 'castration']),
      pixKey: z.string().trim().min(1).max(120),
      goalAmount: z.number().positive().nullable().optional(),
    })
    .optional(),
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
  const bytes = await photoBytes(compressed.uri);
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
  void preparedPhoto(uri).catch(logBestEffort('publish:prepare-photo'));
}

async function putPhoto(uri: string, url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), uploadTimeoutMs);
  try {
    const status = await putPhotoFile(uri, url, controller.signal);
    if (status < 200 || status >= 300) {
      throw new ApiError(status, 'Não consegui enviar a foto. Tente de novo.');
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
      size: draft.size,
      sex: draft.sex,
      ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
      ...(draft.ageEstimate ? { ageEstimate: draft.ageEstimate } : {}),
      ...(draft.care && Object.keys(draft.care).length > 0 ? { care: draft.care } : {}),
      ...(draft.colors && draft.colors.length > 0 ? { colors: draft.colors } : {}),
      ...(draft.helpRequest
        ? {
            helpRequest: {
              kind: draft.helpRequest.kind,
              pixKey: draft.helpRequest.pixKey,
              goalAmount: draft.helpRequest.goalAmount ?? null,
            },
          }
        : {}),
      urgency: draft.urgency,
      description: draft.description,
      latitude: draft.point.latitude,
      longitude: draft.point.longitude,
      accuracyM: draft.accuracyM ?? undefined,
      addressText: draft.addressText ?? undefined,
      referencePoint: draft.referencePoint.trim() || undefined,
      approxLabel: draft.approxLabel,
      // Se a resposta se perder e a fila mandar de novo, a API devolve o mesmo resgate.
      ...(clientKeyPattern.test(draft.id) ? { clientKey: draft.id } : {}),
      media,
    },
  });
}

const clientKeyPattern = /^[A-Za-z0-9_-]{8,64}$/;

/** Id do rascunho, que também vira a chave do envio: único mesmo com dois toques no mesmo ms. */
export function newDraftId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
