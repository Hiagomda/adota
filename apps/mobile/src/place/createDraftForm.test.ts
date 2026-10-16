import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCreateForm, worthKeeping, type CreateForm } from './createDraftForm.ts';

const form: CreateForm = {
  version: 1,
  savedAt: '2026-10-16T12:00:00.000Z',
  photos: ['file:///cache/a.jpg'],
  description: 'Cachorro deitado na calçada.',
  kind: 'rescue_alert',
  species: 'dog',
  size: 'medium',
  sex: 'unknown',
  name: '',
  age: null,
  care: { neutered: true },
  urgency: 'high',
  reference: 'em frente à padaria',
  point: { latitude: -1.45, longitude: -48.48 },
};

test('reads back what was saved', () => {
  assert.deepEqual(parseCreateForm(JSON.stringify(form)), form);
});

test('drops an empty, broken or older draft', () => {
  assert.equal(parseCreateForm(JSON.stringify({ ...form, photos: [], description: ' ' })), null);
  assert.equal(parseCreateForm('{not json'), null);
  assert.equal(parseCreateForm(JSON.stringify({ ...form, version: 0 })), null);
  assert.equal(parseCreateForm(null), null);
});

test('keeps a draft once the person typed or shot something', () => {
  assert.equal(worthKeeping({ photos: [], description: '', name: 'Pretinho' }), true);
  assert.equal(worthKeeping({ photos: [], description: '', name: '' }), false);
});
