import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fieldHelp,
  looksLikeFullName,
  maskCpf,
  termStatusLine,
  type AdoptionTermPage,
} from './term.ts';

const base: AdoptionTermPage = {
  source: 'app',
  giverName: 'ONG Patas',
  requireIdentity: false,
  role: 'tutor',
  canAccept: true,
  waiting: false,
  text: 'Termo',
  accepted: null,
};

test('máscara do CPF', () => {
  assert.equal(maskCpf('529'), '529');
  assert.equal(maskCpf('5299822'), '529.982.2');
  assert.equal(maskCpf('52998224725'), '529.982.247-25');
  assert.equal(maskCpf('529.982.247-2599'), '529.982.247-25');
});

test('nome completo', () => {
  assert.equal(looksLikeFullName('Ana'), false);
  assert.equal(looksLikeFullName('Ana Souza'), true);
});

test('linha do termo no acompanhamento', () => {
  assert.equal(termStatusLine(undefined), null);
  assert.equal(termStatusLine({ ...base, role: null }), null);
  assert.match(termStatusLine(base) ?? '', /aceite/);
  assert.match(
    termStatusLine({ ...base, role: 'responsible', canAccept: false, waiting: true }) ?? '',
    /Esperando/,
  );
  const accepted = {
    ...base,
    canAccept: false,
    role: 'responsible' as const,
    accepted: {
      fullName: 'Ana Souza',
      cpf: null,
      address: null,
      acceptedAt: '2026-11-09T15:00:00Z',
      person: { name: 'Ana', handle: 'ana' },
    },
  };
  assert.match(termStatusLine(accepted) ?? '', /^Ana Souza aceitou em/);
});

test('ajuda dos campos', () => {
  assert.equal(fieldHelp({ adotante: 'nome de quem adota' }), '{adotante} = nome de quem adota');
});
