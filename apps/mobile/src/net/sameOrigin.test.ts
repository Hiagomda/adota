import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProxyRoutes, rewriteUrls } from './sameOrigin.ts';

const routes = parseProxyRoutes(
  'http://imgproxy-a.sslip.io=/img, http://minio-a.sslip.io/=/media/,lixo,=/x',
);

test('reads the route list and drops malformed entries', () => {
  assert.deepEqual(routes, [
    ['http://imgproxy-a.sslip.io', '/img'],
    ['http://minio-a.sslip.io', '/media'],
  ]);
  assert.deepEqual(parseProxyRoutes(undefined), []);
});

test('rewrites photo and upload addresses anywhere in a payload', () => {
  const payload = {
    items: [{ media: [{ url: 'http://imgproxy-a.sslip.io/sig/rs:fill/plain/s3://b/k.jpg' }] }],
    uploads: [{ uploadUrl: 'http://minio-a.sslip.io/patinha-media/k.jpg?X-Amz-Signature=1' }],
    count: 2,
    empty: null,
  };
  assert.deepEqual(rewriteUrls(payload, routes), {
    items: [{ media: [{ url: '/img/sig/rs:fill/plain/s3://b/k.jpg' }] }],
    uploads: [{ uploadUrl: '/media/patinha-media/k.jpg?X-Amz-Signature=1' }],
    count: 2,
    empty: null,
  });
});

test('leaves other hosts and look-alike prefixes alone', () => {
  assert.equal(
    rewriteUrls('https://tiles.openfreemap.org/x', routes),
    'https://tiles.openfreemap.org/x',
  );
  assert.equal(
    rewriteUrls('http://imgproxy-a.sslip.io.evil.com/x', routes),
    'http://imgproxy-a.sslip.io.evil.com/x',
  );
  assert.equal(rewriteUrls('texto', []), 'texto');
});
