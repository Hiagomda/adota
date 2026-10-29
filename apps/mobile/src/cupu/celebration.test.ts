import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { celebrationFor } from './celebration.ts';

describe('cupu celebration', () => {
  it('celebrates the happy endings', () => {
    assert.equal(celebrationFor('adopted', 'rescue')?.title, 'Adotado!');
    assert.equal(celebrationFor('rescued', 'rescue')?.title, 'Resgate concluído!');
    assert.equal(celebrationFor('rescued', 'lost')?.title, 'De volta pra casa!');
    assert.equal(celebrationFor('fostered', 'rescue')?.pose, 'home');
  });

  it('stays quiet on steps that are not an ending', () => {
    assert.equal(celebrationFor('for_adoption', 'rescue'), null);
    assert.equal(celebrationFor('open', 'rescue'), null);
  });
});
