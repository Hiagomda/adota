import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import type { MapPoint } from '../map/geo';

export interface AlertDraft {
  id: string;
  token: string;
  photos: string[];
  description: string;
  kind: 'rescue_alert' | 'lost';
  species: 'dog' | 'cat' | 'other';
  urgency: 'low' | 'medium' | 'high';
  point: MapPoint;
  accuracyM: number | null;
  addressText: string | null;
  referencePoint: string;
  approxLabel: string;
}

export function isOfflineError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('network error')
  );
}

export async function publishAlert(draft: AlertDraft): Promise<{ id: string; reviewStatus: string }> {
  const media: { url: string }[] = [];
  for (const photo of draft.photos) {
    const compressed = await ImageManipulator.manipulateAsync(photo, [{ resize: { width: 1080 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const file = await fetch(compressed.uri);
    const blob = await file.blob();
    const signed = await api<{ uploads: { key: string; uploadUrl: string }[] }>('/uploads/presign', {
      method: 'POST',
      token: draft.token,
      body: { files: [{ contentType: 'image/jpeg', bytes: blob.size }] },
    });
    const upload = signed.uploads[0];
    if (!upload) throw new Error('Sem endereço de envio');
    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body: blob,
    });
    if (!put.ok) throw new Error('Falha no envio');
    media.push({ url: upload.key });
  }
  return api<{ id: string; reviewStatus: string }>('/posts', {
    method: 'POST',
    token: draft.token,
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
