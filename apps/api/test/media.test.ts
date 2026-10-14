import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../src/config.js';
import { publicMediaUrl, storageBucket, uploadEndpoint } from '../src/media.js';

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

  it('sends the phone straight to Cloudflare R2 when the bucket is configured', () => {
    const env = {
      MINIO_ENDPOINT: 'http://minio:9000',
      MINIO_BUCKET: 'patinha-media',
      R2_ACCOUNT_ID: 'abc123',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'patinha-media',
    };
    expect(uploadEndpoint(env)).toBe('https://abc123.r2.cloudflarestorage.com');
    expect(storageBucket(env)).toBe('patinha-media');
  });
});

describe('R2 config', () => {
  it('rejects a half-set Cloudflare account', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', R2_ACCOUNT_ID: 'abc123' })).toThrow(/R2 needs/);
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
