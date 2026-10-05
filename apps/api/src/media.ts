import { createHmac, randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './config.js';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function createStorage(env: Env): S3Client {
  return new S3Client({
    region: 'us-east-1',
    endpoint: env.MINIO_ENDPOINT,
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
  const uploads = [];
  for (const file of files) {
    const extension = extensions[file.contentType];
    if (!extension) {
      throw new Error('Unsupported content type');
    }
    const key = `uploads/${userId}/${randomUUID()}.${extension}`;
    const uploadUrl = await getSignedUrl(
      storage,
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
