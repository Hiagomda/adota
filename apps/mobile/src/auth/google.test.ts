import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { googleHandoffUrl, googleIdTokenFromUrl } from './google.ts';

const options = {
  apiKey: 'public-key',
  authDomain: 'egua-adota.firebaseapp.com',
  projectId: 'egua-adota',
  appId: '1:1:web:abc',
};

describe('google handoff', () => {
  it('builds the handoff page url without putting the token in the path', () => {
    const url = googleHandoffUrl('https://download.example/', options);
    assert.equal(url.startsWith('https://download.example/google.html#'), true);
    assert.equal(url.includes('id_token'), false);
    const hash = new URL(url).hash.slice(1);
    assert.equal(new URLSearchParams(hash).get('projectId'), 'egua-adota');
  });

  it('reads only a three-part id token from the return url', () => {
    assert.equal(googleIdTokenFromUrl('egua://auth?id_token=aa.bb.cc'), 'aa.bb.cc');
    assert.equal(googleIdTokenFromUrl('egua://auth?id_token=nope'), null);
    assert.equal(googleIdTokenFromUrl('egua://auth'), null);
  });
});
