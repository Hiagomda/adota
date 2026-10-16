import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insideServiceArea } from './serviceArea.js';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('service area', () => {
  it('covers Belém and leaves other cities out', () => {
    expect(insideServiceArea({ latitude: -1.45234, longitude: -48.48321 })).toBe(true);
    expect(insideServiceArea({ latitude: -23.5505, longitude: -46.6333 })).toBe(false);
    expect(insideServiceArea({ latitude: -1.2994, longitude: -48.4794 })).toBe(true);
  });

  // The app and the site keep their own copy because they do not depend on this package.
  it('matches the copies in the app and on the site', () => {
    const canonical = source('./serviceArea.ts');
    expect(source('../../../apps/mobile/src/map/serviceArea.ts')).toBe(canonical);
    expect(source('../../../apps/web/app/mapa/serviceArea.ts')).toBe(canonical);
  });
});
