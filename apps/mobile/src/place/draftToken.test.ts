import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenAccount, tokenForDraft } from './draftToken.ts';

function jwt(claims: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.assinatura`;
}

test('lê a conta do token do Firebase e do token local', () => {
  assert.equal(tokenAccount(jwt({ sub: 'uid-maria', exp: 1 })), 'uid-maria');
  assert.equal(tokenAccount('dev:maria@egua.local'), 'dev:maria@egua.local');
  assert.equal(tokenAccount('lixo'), null);
  assert.equal(tokenAccount('a.%%%.c'), null);
});

test('manda o resgate da fila com o token novo da mesma conta', () => {
  const old = jwt({ sub: 'uid-maria', exp: 1 });
  const fresh = jwt({ sub: 'uid-maria', exp: 2 });
  assert.equal(tokenForDraft(old, fresh), fresh);
});

test('segura o resgate sem sessão ou quando outra conta entrou no celular', () => {
  const old = jwt({ sub: 'uid-maria' });
  assert.equal(tokenForDraft(old, null), null);
  assert.equal(tokenForDraft(old, jwt({ sub: 'uid-joao' })), null);
});
