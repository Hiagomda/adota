import { describe, expect, it } from 'vitest';
import { feedPointRequestSchema, feedPointReviewSchema, nextFeedPointStatus } from './feedPoint.js';

const valid = {
  kind: 'both',
  relation: 'mine',
  addressText: 'Praça Batista Campos, lado da Padre Eutíquio',
  latitude: -1.4602,
  longitude: -48.4897,
  note: 'Abasteço de manhã e no fim da tarde.',
};

describe('feedPointRequestSchema', () => {
  it('aceita um ponto em Belém', () => {
    expect(feedPointRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('recusa ponto fora de Belém', () => {
    const result = feedPointRequestSchema.safeParse({
      ...valid,
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(result.success).toBe(false);
  });

  it('só aceita foto enviada pelo próprio app', () => {
    const ok = feedPointRequestSchema.safeParse({
      ...valid,
      photoKey:
        'uploads/2f1c3a4e-1111-4222-8333-944455556666/7a1c3a4e-1111-4222-8333-944455556666.jpg',
    });
    expect(ok.success).toBe(true);
    const bad = feedPointRequestSchema.safeParse({ ...valid, photoKey: 'https://x.com/a.jpg' });
    expect(bad.success).toBe(false);
  });
});

describe('feedPointReviewSchema', () => {
  it('pede motivo para recusar ou tirar do mapa', () => {
    expect(feedPointReviewSchema.safeParse({ action: 'reject' }).success).toBe(false);
    expect(feedPointReviewSchema.safeParse({ action: 'approve' }).success).toBe(true);
  });
});

describe('nextFeedPointStatus', () => {
  it('segue o caminho da revisão', () => {
    expect(nextFeedPointStatus('pending', 'approve')).toBe('approved');
    expect(nextFeedPointStatus('removed', 'approve')).toBe('approved');
    expect(nextFeedPointStatus('approved', 'approve')).toBeNull();
    expect(nextFeedPointStatus('approved', 'reject')).toBeNull();
    expect(nextFeedPointStatus('approved', 'remove')).toBe('removed');
    expect(nextFeedPointStatus('rejected', 'remove')).toBeNull();
  });
});
