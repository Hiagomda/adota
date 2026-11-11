import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CampaignSummary } from '../campaign/campaign.ts';
import type { CommunityEvent } from '../events/agenda.ts';
import { MAX_HIGHLIGHTS, pickHighlights } from './highlights.ts';

const now = new Date('2026-11-11T15:00:00Z');

function campaign(id: string, deadline: string, phase: CampaignSummary['phase'] = 'active') {
  return {
    id,
    title: `Campanha ${id}`,
    goalCents: 100_000,
    raisedCents: 20_000,
    spentCents: 0,
    deadline,
    phase,
    animalId: null,
    postId: null,
    coverUrl: null,
    owner: { name: 'ONG', handle: 'ong', verified: true, avatarUrl: null },
    createdAt: '2026-11-01T12:00:00Z',
  } satisfies CampaignSummary;
}

function event(
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<CommunityEvent> = {},
): CommunityEvent {
  return {
    id,
    title: `Evento ${id}`,
    description: null,
    category: 'neutering',
    placeLabel: 'Praça',
    neighborhood: null,
    location: { latitude: -1.45, longitude: -48.49 },
    distanceKm: null,
    startsAt,
    endsAt,
    state: 'scheduled',
    capacity: null,
    registered: 0,
    waitlisted: 0,
    spotsLeft: null,
    needs: [],
    needsNote: null,
    reviewStatus: 'published',
    reviewNote: null,
    cancelReason: null,
    version: 1,
    result: null,
    organizer: {
      id: 'u',
      name: 'ONG',
      handle: 'ong',
      avatarUrl: null,
      verified: true,
      role: 'ngo',
    },
    registration: null,
    permissions: {
      canManage: false,
      canEdit: false,
      canCancel: false,
      canRecordResult: false,
      canRegister: true,
    },
    ...extra,
  };
}

test('sem campanha nem evento, o banner some', () => {
  assert.deepEqual(pickHighlights([], [], now), []);
});

test('o que está acontecendo vem primeiro, depois campanha e evento se alternam', () => {
  const picked = pickHighlights(
    [campaign('c2', '2026-12-20'), campaign('c1', '2026-11-30')],
    [
      event('e2', '2026-11-20T12:00:00Z', '2026-11-20T16:00:00Z'),
      event('agora', '2026-11-11T13:00:00Z', '2026-11-11T18:00:00Z', { state: 'happening' }),
      event('e1', '2026-11-15T12:00:00Z', '2026-11-15T16:00:00Z'),
    ],
    now,
  );
  assert.deepEqual(
    picked.map((item) => item.id),
    ['event:agora', 'campaign:c1', 'event:e1', 'campaign:c2', 'event:e2'],
  );
});

test('deixa de fora campanha encerrada e evento cancelado, pendente, passado ou distante', () => {
  const picked = pickHighlights(
    [campaign('fim', '2026-11-01', 'ended'), campaign('susp', '2026-12-01', 'suspended')],
    [
      event('cancelado', '2026-11-15T12:00:00Z', '2026-11-15T16:00:00Z', { state: 'cancelled' }),
      event('pendente', '2026-11-15T12:00:00Z', '2026-11-15T16:00:00Z', {
        reviewStatus: 'pending',
      }),
      event('passou', '2026-11-10T12:00:00Z', '2026-11-10T16:00:00Z'),
      event('longe', '2027-01-20T12:00:00Z', '2027-01-20T16:00:00Z'),
    ],
    now,
  );
  assert.deepEqual(picked, []);
});

test(`mostra no máximo ${MAX_HIGHLIGHTS}`, () => {
  const many = Array.from({ length: 10 }, (_, index) =>
    campaign(`c${index}`, `2026-12-${String(index + 10)}`),
  );
  assert.equal(pickHighlights(many, [], now).length, MAX_HIGHLIGHTS);
});
