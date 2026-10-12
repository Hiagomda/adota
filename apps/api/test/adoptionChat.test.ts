import { describe, expect, it } from 'vitest';
import { prepareAdoptionMessage } from '../src/adoptionChat.js';
import { HttpError } from '../src/http.js';

describe('prepareAdoptionMessage', () => {
  it('keeps a normal adoption message', () => {
    expect(prepareAdoptionMessage('Posso conhecer amanhã de tarde?')).toBe(
      'Posso conhecer amanhã de tarde?',
    );
  });

  it('rejects a sale', () => {
    expect(() => prepareAdoptionMessage('quero vender esse cachorro')).toThrow(HttpError);
  });

  it('rejects a pix key', () => {
    expect(() => prepareAdoptionMessage('meu pix é fulano@email.com')).toThrow(/Pix/);
  });

  it('rejects an empty message', () => {
    expect(() => prepareAdoptionMessage('   ')).toThrow(HttpError);
  });
});
