import { describe, expect, it } from 'vitest';
import { liveKind, liveNeighborhood } from '../src/live.js';

const update = (root_type: string, status: string, previous_status: string) => ({
  is_root: false,
  root_type,
  status,
  previous_status,
});

describe('liveKind', () => {
  it('conta o aviso novo pela raiz', () => {
    const root = { is_root: true, previous_status: null };
    expect(liveKind({ ...root, root_type: 'rescue_alert', status: 'open' })).toBe('alert');
    expect(liveKind({ ...root, root_type: 'lost', status: 'open' })).toBe('lost');
    expect(liveKind({ ...root, root_type: 'adoption', status: 'for_adoption' })).toBe(
      'for_adoption',
    );
  });

  it('conta a atualização só quando o status muda', () => {
    expect(liveKind(update('rescue_alert', 'rescued', 'open'))).toBe('rescued');
    expect(liveKind(update('lost', 'rescued', 'open'))).toBe('home');
    expect(liveKind(update('rescue_alert', 'adopted', 'for_adoption'))).toBe('adopted');
    expect(liveKind(update('rescue_alert', 'rescued', 'rescued'))).toBeNull();
    expect(liveKind(update('rescue_alert', 'on_the_way', 'open'))).toBeNull();
  });
});

describe('liveNeighborhood', () => {
  it('fica só com o bairro, ou a cidade', () => {
    expect(liveNeighborhood('Travessa Quintino, 1200 · Marco · Belém')).toBe('Marco');
    expect(liveNeighborhood('-1.45234, -48.48321')).toBe('Belém');
  });
});
