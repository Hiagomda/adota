import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cityAtCenter, cityTarget, cityViewBounds, frameForAnimals } from './cityFrame.ts';
import { municipalityBySlug, type Municipality } from './serviceArea.ts';

const city = (slug: string) => municipalityBySlug(slug) as Municipality;

describe('enquadramento por cidade', () => {
  it('sem animais abre a sede da cidade', () => {
    assert.deepEqual(frameForAnimals(city('castanhal'), []), cityTarget(city('castanhal')));
  });

  it('enquadra os animais da cidade com folga e ignora os de outra cidade', () => {
    const target = frameForAnimals(city('castanhal'), [
      { latitude: -1.2964, longitude: -47.9262 },
      { latitude: -1.31, longitude: -47.9 },
      { latitude: -1.4523, longitude: -48.4832 }, // Belém
    ]);
    assert.ok('bounds' in target);
    assert.ok(target.bounds.west < -47.9262 && target.bounds.east > -47.9);
    assert.ok(target.bounds.west > -48.0, 'o ponto de Belém não entrou');
  });

  it('um animal só não vira zoom de rua', () => {
    const target = frameForAnimals(city('barcarena'), [{ latitude: -1.5058, longitude: -48.6253 }]);
    assert.ok('bounds' in target);
    assert.ok(target.bounds.east - target.bounds.west >= 0.02);
  });

  it('o retângulo de abertura fica em volta da sede', () => {
    const belem = city('belem');
    const view = cityViewBounds(belem);
    assert.ok(view.west < belem.seat.longitude && view.east > belem.seat.longitude);
    assert.ok(view.east - view.west < 0.2);
  });

  it('o seletor acompanha a cidade no meio da tela', () => {
    assert.equal(cityAtCenter(cityViewBounds(city('barcarena')))?.slug, 'barcarena');
    assert.equal(cityAtCenter({ west: -47.2, east: -47.1, south: -1.3, north: -1.2 }), null);
  });
});
