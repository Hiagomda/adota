import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listsAfterWrite } from './postLists.ts';

const id = '3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b';
const names = (lists: (readonly string[])[]) => lists.map((key) => key[0]);

test('mudar status recarrega perfil, adoção, stories e o XP', () => {
  const lists = names(listsAfterWrite('PATCH', `/posts/${id}/status`));
  for (const key of ['posts', 'map', 'profile-posts', 'adoption', 'home-adoption', 'stories']) {
    assert.ok(lists.includes(key), key);
  }
  assert.ok(lists.includes('volunteer'));
});

test('publicar recarrega as listas e o XP', () => {
  assert.ok(names(listsAfterWrite('POST', '/posts')).includes('volunteer'));
});

test('editar ou excluir recarrega as listas sem mexer no XP', () => {
  const lists = names(listsAfterWrite('DELETE', `/posts/${id}`));
  assert.ok(lists.includes('profile-posts'));
  assert.ok(!lists.includes('volunteer'));
});

test('leitura, curtida, salvar, story e outras rotas não recarregam nada', () => {
  assert.deepEqual(listsAfterWrite('GET', `/posts/${id}`), []);
  assert.deepEqual(listsAfterWrite('POST', `/posts/${id}/like`), []);
  assert.deepEqual(listsAfterWrite('POST', `/posts/${id}/save`), []);
  assert.deepEqual(listsAfterWrite('POST', `/posts/${id}/story-view`), []);
  assert.deepEqual(listsAfterWrite('PATCH', '/me'), []);
  assert.deepEqual(listsAfterWrite('POST', '/postsx'), []);
});
