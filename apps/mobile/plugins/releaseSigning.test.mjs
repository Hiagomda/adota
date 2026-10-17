import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addReleaseSigning } from './releaseSigning.mjs';

// O build.gradle que o `expo prebuild` gera para este app (SDK 57).
const generated = readFileSync(new URL('./fixtures/app.build.gradle', import.meta.url), 'utf8');

test('o release só assina com a chave de upload quando o Gradle sabe onde ela está', () => {
  const next = addReleaseSigning(generated);
  assert.match(next, /storeFile file\(findProperty\('EGUA_UPLOAD_STORE_FILE'\)\)/);
  assert.match(
    next,
    /release \{[\s\S]*?signingConfig findProperty\('EGUA_UPLOAD_STORE_FILE'\) \? signingConfigs\.release : signingConfigs\.debug/,
  );
  // O build de debug continua com a chave de debug.
  assert.match(next, /debug \{\n\s*signingConfig signingConfigs\.debug/);
});

test('rodar o plugin duas vezes deixa o arquivo igual ao da primeira vez', () => {
  const once = addReleaseSigning(generated);
  assert.equal(addReleaseSigning(once), once);
});

test('um template sem a assinatura de debug falha com erro claro', () => {
  assert.throws(() => addReleaseSigning('android {}'), /signingConfigs\.debug not found/);
});
