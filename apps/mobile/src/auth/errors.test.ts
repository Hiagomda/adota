import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthError, authErrorFrom, mapFirebaseCode } from './errors.ts';

describe('auth errors', () => {
  it('does not reveal which credential was wrong', () => {
    for (const code of ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-credential']) {
      assert.equal(mapFirebaseCode(code), 'invalid-credentials');
    }
    assert.equal(new AuthError('invalid-credentials').message, 'E-mail ou senha incorretos.');
  });

  it('translates the cases the screen has to explain', () => {
    assert.equal(mapFirebaseCode('auth/email-already-in-use'), 'email-in-use');
    assert.equal(mapFirebaseCode('auth/too-many-requests'), 'too-many-requests');
    assert.equal(mapFirebaseCode('auth/network-request-failed'), 'offline');
    assert.equal(mapFirebaseCode('auth/user-disabled'), 'disabled');
    assert.equal(mapFirebaseCode('auth/unknown-future'), 'unexpected');
  });

  it('reads the code off a Firebase-like error and keeps AuthError as-is', () => {
    const mapped = authErrorFrom({ code: 'auth/weak-password' });
    assert.equal(mapped.code, 'weak-password');
    const existing = new AuthError('offline');
    assert.equal(authErrorFrom(existing), existing);
  });
});
