import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWhatsApp, normalizeWhatsApp, whatsappUrl } from './whatsapp.ts';

test('reads the ways people type a Belém mobile', () => {
  assert.equal(normalizeWhatsApp('(91) 98888-7777'), '5591988887777');
  assert.equal(normalizeWhatsApp('+55 91 98888 7777'), '5591988887777');
  assert.equal(normalizeWhatsApp('91 3222-1111'), '559132221111');
});

test('refuses what is not a Brazilian phone', () => {
  assert.equal(normalizeWhatsApp('988887777'), null);
  assert.equal(normalizeWhatsApp('(91) 88888-7777'), null);
  assert.equal(normalizeWhatsApp(''), null);
});

test('shows the stored number the way people write it', () => {
  assert.equal(formatWhatsApp('5591988887777'), '(91) 98888-7777');
  assert.equal(formatWhatsApp('559132221111'), '(91) 3222-1111');
  assert.equal(formatWhatsApp('abc'), 'abc');
});

test('builds a wa.me link with the first message', () => {
  assert.equal(
    whatsappUrl('5591988887777', 'Oi! Quero adotar a Mel.'),
    'https://wa.me/5591988887777?text=Oi!%20Quero%20adotar%20a%20Mel.',
  );
});
