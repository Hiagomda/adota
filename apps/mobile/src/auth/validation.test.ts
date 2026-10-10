import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  confirmPasswordError,
  emailError,
  nameError,
  normalizeEmail,
  passwordError,
  passwordStrength,
} from './validation.ts';

describe('auth validation', () => {
  it('normalizes e-mail', () => {
    assert.equal(normalizeEmail('  Ana@Email.com '), 'ana@email.com');
  });

  it('rejects an empty or malformed e-mail', () => {
    assert.equal(emailError('  '), 'Informe seu e-mail.');
    assert.equal(emailError('ana@'), 'Esse e-mail não parece válido.');
    assert.equal(emailError('ana@email.com'), null);
  });

  it('requires a name and a password of 8 characters', () => {
    assert.ok(nameError(' '));
    assert.equal(nameError('Ana'), null);
    assert.equal(passwordError(''), 'Informe sua senha.');
    assert.ok(passwordError('curta'));
    assert.equal(passwordError('12345678'), null);
  });

  it('checks the confirmation and ranks strength', () => {
    assert.ok(confirmPasswordError('12345678', '12345679'));
    assert.equal(confirmPasswordError('12345678', '12345678'), null);
    assert.equal(passwordStrength(''), 'empty');
    assert.equal(passwordStrength('12345678'), 'weak');
    assert.equal(passwordStrength('SenhaForte1!'), 'strong');
  });
});
