import { describe, expect, it } from 'vitest';
import { deadPushTokens } from '../src/notify.js';

describe('tokens de push mortos', () => {
  it('separa só os que o Firebase recusou de vez', () => {
    expect(
      deadPushTokens(
        ['vivo', 'desinstalado', 'invalido', 'cota'],
        [
          null,
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
          'messaging/quota-exceeded',
        ],
      ),
    ).toEqual(['desinstalado', 'invalido']);
  });
});
