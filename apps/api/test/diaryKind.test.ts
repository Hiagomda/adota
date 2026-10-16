import { describe, expect, it } from 'vitest';
import { diaryKind } from '../src/feed.js';

describe('diaryKind', () => {
  it('spots the note of someone who did not find the animal', () => {
    expect(diaryKind('Não encontrei o animal.', 'on_the_way')).toBe('not_found');
    expect(diaryKind('Não encontrei o animal.', 'not_found')).toBe('not_found');
  });

  it('spots a step change written by the server', () => {
    expect(diaryKind('Alguém está a caminho.', 'on_the_way')).toBe('status');
    expect(diaryKind('Animal resgatado.', 'rescued')).toBe('status');
  });

  it('keeps what people write as a note', () => {
    expect(diaryKind('Está comendo bem e tomou banho.', 'rescued')).toBe('note');
    expect(diaryKind('Animal resgatado.', 'on_the_way')).toBe('note');
  });
});
