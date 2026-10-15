import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../src/config.js';
import { publicMediaUrl, uploadEndpoint } from '../src/media.js';

describe('upload endpoint', () => {
  it('uses the public host when the phone cannot reach the internal one', () => {
    expect(
      uploadEndpoint({
        MINIO_ENDPOINT: 'http://minio:9000',
        MINIO_PUBLIC_ENDPOINT: 'http://minio.example/',
      }),
    ).toBe('http://minio.example');
  });

  it('keeps the internal host for local development', () => {
    expect(uploadEndpoint({ MINIO_ENDPOINT: 'http://localhost:9000' })).toBe(
      'http://localhost:9000',
    );
  });
});

describe('photo storage config', () => {
  // Half-set Cloudflare variables left in Coolify used to stop the API at boot.
  it('boots and ignores leftover Cloudflare R2 variables', () => {
    const env = loadEnv({ NODE_ENV: 'test', R2_ACCOUNT_ID: 'abc123', R2_BUCKET: 'old' });
    expect(env.MINIO_BUCKET).toBe('patinha-media');
    expect(uploadEndpoint(env)).toBe('http://localhost:9000');
  });

  it('points imgproxy at the MinIO bucket', () => {
    const env = loadEnv({ NODE_ENV: 'test', R2_BUCKET: 'old', IMGPROXY_URL: 'http://img.example' });
    const source = publicMediaUrl(env, 'uploads/a.jpg', 'thumb').split('/').pop() ?? '';
    expect(Buffer.from(source, 'base64url').toString()).toBe('s3://patinha-media/uploads/a.jpg');
  });
});

describe('public media url', () => {
  const env = {
    IMGPROXY_URL: 'http://img.example',
    IMGPROXY_KEY: '',
    IMGPROXY_SALT: '',
    MINIO_BUCKET: 'patinha-media',
  } as Env;

  it('asks imgproxy for WebP at the same frame the app already uses', () => {
    const thumb = publicMediaUrl(env, 'uploads/a.jpg', 'thumb');
    const full = publicMediaUrl(env, 'uploads/a.jpg', 'full');
    expect(thumb).toContain('/rs:fill:480:600/q:80/f:webp/');
    expect(full).toContain('/rs:fit:1080:1350/q:80/f:webp/');
    expect(thumb.startsWith('http://img.example/insecure/')).toBe(true);
  });

  it('leaves an already public url untouched', () => {
    expect(publicMediaUrl(env, 'https://cdn.example/a.jpg', 'thumb')).toBe(
      'https://cdn.example/a.jpg',
    );
  });
});
