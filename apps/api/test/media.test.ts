import { describe, expect, it } from 'vitest';
import { uploadEndpoint } from '../src/media.js';

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
