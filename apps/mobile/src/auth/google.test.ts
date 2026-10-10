import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { googleIdTokenFromUrl } from './google.ts';

describe('google return token', () => {
  it('reads only a three-part id token from the return url', () => {
    assert.equal(googleIdTokenFromUrl('egua://auth?id_token=aa.bb.cc'), 'aa.bb.cc');
    assert.equal(googleIdTokenFromUrl('egua://auth?id_token=nope'), null);
    assert.equal(googleIdTokenFromUrl('egua://auth'), null);
  });
});
