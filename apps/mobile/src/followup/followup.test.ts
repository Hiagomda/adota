import assert from 'node:assert/strict';
import test from 'node:test';
import { dayTitle, needsAttention, pendingCheckin, type FollowupPage } from './followup.ts';

const page = (role: FollowupPage['role'], answered: boolean): FollowupPage => ({
  role,
  canSetAdopter: false,
  candidates: [],
  followup: {
    id: 'f',
    adoptedAt: '2026-10-01T00:00:00Z',
    closed: false,
    tutor: { name: 'Ana', handle: 'ana' },
    checkins: [
      {
        day: 7,
        dueAt: '',
        due: true,
        answeredAt: answered ? 'x' : null,
        mood: answered ? 'hard' : null,
        note: null,
        wantsHelp: false,
      },
      {
        day: 30,
        dueAt: '',
        due: false,
        answeredAt: null,
        mood: null,
        note: null,
        wantsHelp: false,
      },
      {
        day: 90,
        dueAt: '',
        due: false,
        answeredAt: null,
        mood: null,
        note: null,
        wantsHelp: false,
      },
    ],
  },
});

test('the tutor answers the oldest check-in that arrived', () => {
  assert.equal(pendingCheckin(page('tutor', false))?.day, 7);
  assert.equal(pendingCheckin(page('tutor', true)), null);
  assert.equal(pendingCheckin(page('responsible', false)), null);
});

test('a hard answer asks for attention', () => {
  assert.equal(needsAttention(page('responsible', true)), true);
  assert.equal(needsAttention(page('responsible', false)), false);
  assert.equal(dayTitle(30), '1 mês');
});
