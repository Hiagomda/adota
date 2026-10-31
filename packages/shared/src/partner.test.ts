import { describe, expect, it } from 'vitest';
import {
  nextPartnerStatus,
  partnerMapQuerySchema,
  partnerRequestSchema,
  partnerReviewSchema,
} from './partner.js';

const valid = {
  name: 'Petshop do Guamá',
  kind: 'petshop',
  perk: '10% de desconto em ração para quem adotar pelo app',
  addressText: 'Rua José Bonifácio, 100 · Guamá',
  latitude: -1.4558,
  longitude: -48.4902,
  whatsapp: '(91) 98888-7777',
  instagram: '@petshopguama',
};

describe('partnerRequestSchema', () => {
  it('normaliza WhatsApp e Instagram', () => {
    const parsed = partnerRequestSchema.parse(valid);
    expect(parsed.whatsapp).toBe('5591988887777');
    expect(parsed.instagram).toBe('petshopguama');
  });

  it('recusa WhatsApp que não é telefone', () => {
    const result = partnerRequestSchema.safeParse({ ...valid, whatsapp: '1234' });
    expect(result.success).toBe(false);
  });

  it('recusa ponto fora de Belém', () => {
    const result = partnerRequestSchema.safeParse({
      ...valid,
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(result.success).toBe(false);
  });

  it('exige a vantagem', () => {
    expect(partnerRequestSchema.safeParse({ ...valid, perk: '' }).success).toBe(false);
  });

  it('recusa link no lugar do @', () => {
    const result = partnerRequestSchema.safeParse({
      ...valid,
      instagram: 'https://instagram.com/x',
    });
    expect(result.success).toBe(false);
  });
});

describe('partnerReviewSchema', () => {
  it('pede motivo para recusar ou pausar', () => {
    expect(partnerReviewSchema.safeParse({ action: 'reject' }).success).toBe(false);
    expect(
      partnerReviewSchema.safeParse({ action: 'pause', note: 'Denúncia de cliente' }).success,
    ).toBe(true);
    expect(partnerReviewSchema.safeParse({ action: 'approve' }).success).toBe(true);
  });
});

describe('nextPartnerStatus', () => {
  it('segue o caminho da revisão', () => {
    expect(nextPartnerStatus('pending', 'approve')).toBe('approved');
    expect(nextPartnerStatus('pending', 'reject')).toBe('rejected');
    expect(nextPartnerStatus('approved', 'pause')).toBe('paused');
    expect(nextPartnerStatus('paused', 'approve')).toBe('approved');
    expect(nextPartnerStatus('approved', 'approve')).toBeNull();
    expect(nextPartnerStatus('rejected', 'pause')).toBeNull();
  });
});

describe('partnerMapQuerySchema', () => {
  it('lê a área do mapa', () => {
    const parsed = partnerMapQuerySchema.parse({
      west: '-48.6',
      south: '-1.5',
      east: '-48.4',
      north: '-1.3',
    });
    expect(parsed.west).toBe(-48.6);
    expect(partnerMapQuerySchema.safeParse({ west: 1, south: 0, east: 0, north: 1 }).success).toBe(
      false,
    );
  });
});
