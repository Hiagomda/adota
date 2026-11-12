import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc16, normalizePixKey, pixCopyPaste } from './pix.ts';

test('crc16 bate com o valor de referência do CCITT-FALSE', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('normaliza cada tipo de chave', () => {
  assert.equal(normalizePixKey(' Pix@ONG.org '), 'pix@ong.org');
  assert.equal(normalizePixKey('(91) 98888-7777'), '+5591988887777');
  assert.equal(normalizePixKey('+55 91 98888-7777'), '+5591988887777');
  assert.equal(normalizePixKey('529.982.247-25'), '52998224725');
  assert.equal(normalizePixKey('12.345.678/0001-95'), '12345678000195');
  assert.equal(
    normalizePixKey('123E4567-E89B-12D3-A456-426614174000'),
    '123e4567-e89b-12d3-a456-426614174000',
  );
});

test('monta o copia e cola com nome sem acento e CRC no fim', () => {
  const code = pixCopyPaste({ key: 'pix@ong.org', name: 'ONG Patinhas de Belém', city: 'Belém' });
  assert.ok(code.startsWith('000201'));
  assert.ok(code.includes('0014br.gov.bcb.pix0111pix@ong.org'));
  assert.ok(code.includes('5921ONG PATINHAS DE BELEM'));
  assert.ok(code.includes('6005BELEM'));
  assert.ok(code.includes('62070503***'));
  const body = code.slice(0, -4);
  assert.ok(body.endsWith('6304'));
  assert.equal(code.slice(-4), crc16(body));
});

test('corta o nome em 25 letras', () => {
  const code = pixCopyPaste({
    key: 'pix@ong.org',
    name: 'Associação Protetora dos Animais de Rua de Belém',
    city: 'Belem',
  });
  assert.ok(code.includes('5924ASSOCIACAO PROTETORA DOS6005BELEM'));
});
