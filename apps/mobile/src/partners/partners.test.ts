import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INVITE_FIRST_DELAY_MS,
  INVITE_REPEAT_MS,
  nearestPartners,
  partnerGreeting,
  routeUrl,
  shouldInvite,
  spotlightSlot,
} from './partners.ts';

const day = 24 * 60 * 60 * 1000;

test('the invite waits for the first days and then repeats every three weeks', () => {
  const start = 1_000_000_000_000;
  const fresh = { firstSeenAt: start, lastShownAt: null, muted: false };
  assert.equal(shouldInvite(fresh, start + day, false), false);
  assert.equal(shouldInvite(fresh, start + INVITE_FIRST_DELAY_MS, false), true);
  const shown = { ...fresh, lastShownAt: start + INVITE_FIRST_DELAY_MS };
  assert.equal(shouldInvite(shown, start + INVITE_FIRST_DELAY_MS + 5 * day, false), false);
  assert.equal(shouldInvite(shown, start + INVITE_FIRST_DELAY_MS + INVITE_REPEAT_MS, false), true);
});

test('the invite never shows to partners, muted people or before the first visit is known', () => {
  const now = 2_000_000_000_000;
  const old = { firstSeenAt: 0, lastShownAt: null, muted: false };
  assert.equal(shouldInvite(old, now, true), false);
  assert.equal(shouldInvite({ ...old, muted: true }, now, false), false);
  assert.equal(shouldInvite({ ...old, firstSeenAt: null }, now, false), false);
});

test('featured partners come first, then the closest', () => {
  const here = { latitude: -1.45, longitude: -48.49 };
  const far = { id: 'far', featured: false, location: { latitude: -1.3, longitude: -48.4 } };
  const near = { id: 'near', featured: false, location: { latitude: -1.451, longitude: -48.49 } };
  const star = { id: 'star', featured: true, location: { latitude: -1.2, longitude: -48.3 } };
  assert.deepEqual(
    nearestPartners([far, near, star], here).map((item) => item.id),
    ['star', 'near', 'far'],
  );
});

test('builds the greeting and the route link', () => {
  assert.equal(
    partnerGreeting({ name: 'Petshop do Guamá' }),
    'Oi, Petshop do Guamá! Vi vocês no Égua, adota! como Parceiro do Cupu.',
  );
  assert.equal(
    routeUrl({ latitude: -1.45, longitude: -48.49 }),
    'https://www.google.com/maps/dir/?api=1&destination=-1.45,-48.49',
  );
});

test('the feed spotlight goes after the 4th rescue and then every 12', () => {
  const slots = Array.from({ length: 30 }, (_, index) => spotlightSlot(index));
  assert.deepEqual(
    slots.flatMap((slot, index) => (slot === null ? [] : [[index, slot]])),
    [
      [3, 0],
      [15, 1],
      [27, 2],
    ],
  );
});
