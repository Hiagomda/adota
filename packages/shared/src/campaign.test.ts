import { describe, expect, it } from 'vitest';
import {
  campaignCreateSchemaAt,
  campaignEntrySchemaAt,
  campaignPhase,
  campaignPledgeSchemaAt,
  campaignTotals,
  campaignUpdateSchemaAt,
} from './campaign.js';

const now = new Date('2026-10-28T02:00:00Z'); // 27/10 23h em Belém
const receipt =
  'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';

const base = {
  title: 'Cirurgia da Mel',
  purpose: 'A Mel quebrou a pata e precisa de cirurgia e duas semanas de internação.',
  goalCents: 150_000,
  deadline: '2026-11-30',
  pixKey: 'ong@exemplo.org',
};

describe('campaign create', () => {
  const schema = campaignCreateSchemaAt(now);

  it('accepts a campaign with goal, reason and deadline', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('accepts today as the last day in Belém', () => {
    expect(schema.safeParse({ ...base, deadline: '2026-10-27' }).success).toBe(true);
  });

  it('refuses a deadline in the past or more than a year away', () => {
    expect(schema.safeParse({ ...base, deadline: '2026-10-26' }).success).toBe(false);
    expect(schema.safeParse({ ...base, deadline: '2027-12-01' }).success).toBe(false);
  });

  it('refuses a goal in reais with cents as a fraction', () => {
    expect(schema.safeParse({ ...base, goalCents: 1500.5 }).success).toBe(false);
    expect(schema.safeParse({ ...base, goalCents: 500 }).success).toBe(false);
  });

  it('refuses a short reason', () => {
    expect(schema.safeParse({ ...base, purpose: 'Ajuda' }).success).toBe(false);
  });
});

describe('campaign update', () => {
  const schema = campaignUpdateSchemaAt(now);

  it('needs a reason and at least one change', () => {
    expect(schema.safeParse({ reason: 'Orçamento novo da clínica' }).success).toBe(false);
    expect(schema.safeParse({ goalCents: 200_000 }).success).toBe(false);
    expect(
      schema.safeParse({ goalCents: 200_000, reason: 'Orçamento novo da clínica' }).success,
    ).toBe(true);
  });
});

describe('entries and pledges', () => {
  it('requires a receipt on the owner entry', () => {
    const schema = campaignEntrySchemaAt(now);
    const entry = {
      kind: 'expense',
      amountCents: 35_000,
      description: 'Raio-x',
      occurredOn: '2026-10-27',
    };
    expect(schema.safeParse(entry).success).toBe(false);
    expect(schema.safeParse({ ...entry, receiptKey: receipt }).success).toBe(true);
    expect(schema.safeParse({ ...entry, receiptKey: 'https://evil.example/x.jpg' }).success).toBe(
      false,
    );
  });

  it('refuses a date in the future', () => {
    const schema = campaignPledgeSchemaAt(now);
    expect(schema.safeParse({ amountCents: 5_000, occurredOn: '2026-10-28' }).success).toBe(false);
    const parsed = schema.parse({ amountCents: 5_000, occurredOn: '2026-10-27' });
    expect(parsed.showName).toBe(false);
  });
});

describe('totals', () => {
  it('counts only confirmed money and keeps pledges apart', () => {
    const totals = campaignTotals([
      { kind: 'donation', status: 'confirmed', amountCents: 10_000 },
      { kind: 'donation', status: 'pending', amountCents: 5_000 },
      { kind: 'donation', status: 'rejected', amountCents: 7_000 },
      { kind: 'donation', status: 'voided', amountCents: 9_000 },
      { kind: 'expense', status: 'confirmed', amountCents: 4_000 },
      { kind: 'expense', status: 'voided', amountCents: 1_000 },
    ]);
    expect(totals).toEqual({
      raisedCents: 10_000,
      spentCents: 4_000,
      balanceCents: 6_000,
      pendingCents: 5_000,
      pendingCount: 1,
    });
  });
});

describe('phase', () => {
  it('ends after the last day but staff and owner decisions win', () => {
    expect(campaignPhase('active', '2026-10-27', '2026-10-27')).toBe('active');
    expect(campaignPhase('active', '2026-10-26', '2026-10-27')).toBe('ended');
    expect(campaignPhase('closed', '2026-12-01', '2026-10-27')).toBe('closed');
    expect(campaignPhase('suspended', '2026-12-01', '2026-10-27')).toBe('suspended');
  });
});
