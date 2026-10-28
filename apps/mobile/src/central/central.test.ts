import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeFilterCount,
  belemClock,
  caseDistance,
  centralPath,
  defaultCentralFilters,
  freshCaseIds,
  helpOfferKinds,
  helpSummary,
  offerFormError,
} from './central.ts';

const here = { latitude: -1.452341, longitude: -48.483219 };

test('central path leaves distance out without a GPS fix', () => {
  const filters = { ...defaultCentralFilters, radiusKm: 5, species: 'cat' as const };
  assert.equal(centralPath(filters, null), '/central?species=cat');
  assert.equal(
    centralPath(filters, here),
    '/central?latitude=-1.45234&longitude=-48.48322&radiusKm=5&species=cat',
  );
  assert.equal(centralPath(defaultCentralFilters, null), '/central');
  assert.equal(
    centralPath({ ...defaultCentralFilters, status: 'not_found', withoutHelp: true }, null),
    '/central?status=not_found&withoutHelp=true',
  );
});

test('filter count ignores distance when there is no location', () => {
  const filters = { ...defaultCentralFilters, radiusKm: 5, withoutHelp: true };
  assert.equal(activeFilterCount(filters, false), 1);
  assert.equal(activeFilterCount(filters, true), 2);
});

test('fresh cases are new ones or ones touched since the last look', () => {
  const cases = [
    { id: 'a', lastActivityAt: '2026-10-28T10:00:00Z' },
    { id: 'b', lastActivityAt: '2026-10-28T10:05:00Z' },
    { id: 'c', lastActivityAt: '2026-10-28T09:00:00Z' },
  ];
  assert.equal(freshCaseIds(null, cases).size, 0);
  const fresh = freshCaseIds({ serverTime: '2026-10-28T10:01:00Z', ids: ['a', 'b'] }, cases);
  assert.deepEqual([...fresh].sort(), ['b', 'c']);
});

test('help summary lists who is helping and how', () => {
  const none = { foster: 0, food: 0, vet: 0, supplies: 0, other: 0 };
  assert.equal(helpSummary({ goingCount: 0, offerCounts: none }), 'Ninguém ajudando ainda');
  assert.equal(
    helpSummary({ goingCount: 2, offerCounts: { ...none, foster: 1, food: 1 } }),
    '2 a caminho · 1 lar · 1 ração',
  );
  assert.equal(
    helpSummary({ goingCount: 0, offerCounts: none, fosterStay: 'approved' }),
    'Casa Amiga aceitou',
  );
});

test('distance uses the comma', () => {
  assert.equal(caseDistance(1.5), 'a 1,5 km');
  assert.equal(caseDistance(null), '');
});

test('offer form follows the server rule and has no transport', () => {
  assert.equal(offerFormError(null, ''), 'Escolha como você pode ajudar.');
  assert.equal(offerFormError('food', ''), null);
  assert.ok(offerFormError('other', 'oi'));
  assert.equal(offerFormError('other', 'Tenho caixa'), null);
  assert.ok(!helpOfferKinds.some((kind) => (kind.value as string) === 'transport'));
});

test('clock is in Belém time', () => {
  assert.equal(belemClock('2026-10-28T17:05:00Z'), '14:05');
  assert.equal(belemClock('invalid'), '');
});
