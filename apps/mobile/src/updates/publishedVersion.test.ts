import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNewerNativeRelease, parsePublishedNativeApp } from './publishedVersion.ts';

test('version.json sem reinstall continua sendo atualização por cima', () => {
  const published = parsePublishedNativeApp({
    version: '0.1.0',
    androidVersionCode: 36,
    notes: [],
  });
  assert.equal(published?.reinstall, false);
});

test('reinstall só vale com true, não com texto', () => {
  assert.equal(
    parsePublishedNativeApp({ version: '0.1.0', androidVersionCode: 37, reinstall: true })
      ?.reinstall,
    true,
  );
  assert.equal(
    parsePublishedNativeApp({ version: '0.1.0', androidVersionCode: 37, reinstall: 'sim' })
      ?.reinstall,
    false,
  );
});

test('a versão que pede reinstalação só aparece para quem tem build mais velho', () => {
  const published = parsePublishedNativeApp({
    version: '0.1.0',
    androidVersionCode: 37,
    reinstall: true,
  });
  assert.ok(published);
  assert.equal(isNewerNativeRelease({ version: '0.1.0', androidVersionCode: 36 }, published), true);
  assert.equal(
    isNewerNativeRelease({ version: '0.1.0', androidVersionCode: 37 }, published),
    false,
  );
});
