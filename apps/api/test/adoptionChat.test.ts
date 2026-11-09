import { describe, expect, it } from 'vitest';
import { prepareAdoptionMessage } from '../src/adoptionChat.js';
import { HttpError } from '../src/http.js';

describe('prepareAdoptionMessage', () => {
  it('keeps a normal adoption message', () => {
    expect(prepareAdoptionMessage('Posso conhecer amanhã de tarde?')).toEqual({
      body: 'Posso conhecer amanhã de tarde?',
      scan: { flags: [], blocked: false },
    });
  });

  it('withholds a sale', () => {
    expect(prepareAdoptionMessage('quero vender esse cachorro').scan.blocked).toBe(true);
  });

  it('withholds a pix key', () => {
    expect(prepareAdoptionMessage('meu pix é fulano@email.com').scan).toMatchObject({
      blocked: true,
      flags: expect.arrayContaining(['money', 'external_contact']),
    });
  });

  it('delivers but flags talk that leaves the app', () => {
    expect(prepareAdoptionMessage('me chama no zap 91988887777').scan).toEqual({
      flags: ['external_contact'],
      blocked: false,
    });
  });

  it('rejects an empty message', () => {
    expect(() => prepareAdoptionMessage('   ')).toThrow(HttpError);
  });
});
