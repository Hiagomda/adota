import { createHmac, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { assertOwnedMedia, extensionKind, sniffImage } from './mediaPolicy.js';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Address baked into the presigned upload URL. The API itself keeps using the internal endpoint. */
export function uploadEndpoint(env: Pick<Env, 'MINIO_ENDPOINT' | 'MINIO_PUBLIC_ENDPOINT'>): string {
  const pub = env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '');
  return pub && pub.length > 0 ? pub : env.MINIO_ENDPOINT;
}

export function createStorage(env: Env): S3Client {
  return storageClient(env, env.MINIO_ENDPOINT);
}

function storageClient(env: Env, endpoint: string): S3Client {
  return new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
    },
  });
}

export async function presignUploads(
  env: Env,
  storage: S3Client,
  userId: string,
  files: { contentType: string; bytes: number }[],
): Promise<{ key: string; uploadUrl: string; contentType: string }[]> {
  const endpoint = uploadEndpoint(env);
  const signer = endpoint === env.MINIO_ENDPOINT ? storage : storageClient(env, endpoint);
  const uploads = [];
  for (const file of files) {
    const extension = extensions[file.contentType];
    if (!extension) {
      throw new Error('Unsupported content type');
    }
    const key = `uploads/${userId}/${randomUUID()}.${extension}`;
    const uploadUrl = await getSignedUrl(
      signer,
      new PutObjectCommand({
        Bucket: env.MINIO_BUCKET,
        Key: key,
        ContentType: file.contentType,
        ContentLength: file.bytes,
      }),
      { expiresIn: 600 },
    );
    uploads.push({ key, uploadUrl, contentType: file.contentType });
  }
  return uploads;
}

/**
 * In production, read the first bytes of each upload and reject anything that is not a real image.
 * Tests skip the storage read so they do not need MinIO; the key still has to belong to the account.
 */
export async function verifyUploadedImages(
  env: Env,
  storage: S3Client,
  userId: string,
  urls: string[],
): Promise<void> {
  assertOwnedMedia(userId, urls);
  if (env.NODE_ENV !== 'production' || urls.length === 0) return;
  await Promise.all(urls.map((url) => verifyOneUpload(env, storage, url)));
}

async function verifyOneUpload(env: Env, storage: S3Client, url: string): Promise<void> {
  const expected = extensionKind(url);
  let bytes: Uint8Array | undefined;
  try {
    const object = await storage.send(
      new GetObjectCommand({
        Bucket: env.MINIO_BUCKET,
        Key: url,
        Range: 'bytes=0-31',
      }),
    );
    bytes = await object.Body?.transformToByteArray();
  } catch (error) {
    const name =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      typeof error.name === 'string'
        ? error.name
        : '';
    if (name === 'NoSuchKey' || name === 'NotFound') {
      throw new HttpError(400, 'Não encontrei essa foto. Envie de novo.');
    }
    throw new HttpError(503, 'Não consegui conferir a foto. Tente de novo.');
  }
  if (!bytes || sniffImage(bytes) !== expected) {
    await storage
      .send(new DeleteObjectCommand({ Bucket: env.MINIO_BUCKET, Key: url }))
      .catch(() => undefined);
    throw new HttpError(400, 'A foto enviada não é uma imagem válida.');
  }
}

export function publicMediaUrl(env: Env, stored: string, variant: 'full' | 'thumb'): string {
  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    return stored;
  }
  const processing = variant === 'thumb' ? 'rs:fill:480:600' : 'rs:fit:1080:1350';
  const source = Buffer.from(`s3://${env.MINIO_BUCKET}/${stored}`).toString('base64url');
  const path = `/${processing}/${source}`;
  const signature =
    env.IMGPROXY_KEY && env.IMGPROXY_SALT
      ? signImgproxy(path, env.IMGPROXY_KEY, env.IMGPROXY_SALT)
      : 'insecure';
  return `${env.IMGPROXY_URL.replace(/\/$/, '')}/${signature}${path}`;
}

function signImgproxy(path: string, keyHex: string, saltHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const salt = Buffer.from(saltHex, 'hex');
  const hmac = createHmac('sha256', key);
  hmac.update(salt);
  hmac.update(path);
  return hmac.digest('base64url');
}
