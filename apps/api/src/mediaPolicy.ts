import { HttpError } from './http.js';

const keyPattern =
  /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

export type ImageKind = 'jpeg' | 'png' | 'webp';

/** The key has to be one this account received from `/uploads/presign`. */
export function ownedMediaKey(userId: string, url: string): boolean {
  const match = keyPattern.exec(url);
  if (!match?.[1] || !match[3]) return false;
  return match[1].toLowerCase() === userId.toLowerCase();
}

export function extensionKind(url: string): ImageKind | null {
  const match = keyPattern.exec(url);
  const extension = match?.[3]?.toLowerCase();
  if (extension === 'jpg') return 'jpeg';
  if (extension === 'png') return 'png';
  if (extension === 'webp') return 'webp';
  return null;
}

/** Magic bytes, not the file name. A renamed executable does not pass. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export function assertOwnedMedia(userId: string, urls: string[]): void {
  for (const url of urls) {
    if (!ownedMediaKey(userId, url)) {
      throw new HttpError(400, 'A foto precisa ser um envio da sua conta.');
    }
  }
}
