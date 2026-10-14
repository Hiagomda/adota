import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cameraFramesPoint, type MapBounds } from './geo.ts';

const pin = { latitude: -1.4, longitude: -48.45 };

describe('cameraFramesPoint', () => {
  it('rejects the wide opening view of the city', () => {
    const city: MapBounds = { west: -48.6, south: -1.55, east: -48.38, north: -1.35 };
    assert.equal(cameraFramesPoint(city, pin), false);
  });

  it('rejects the default city zoom even when the pin is in the middle', () => {
    const opened: MapBounds = { west: -48.524, south: -1.48, east: -48.456, north: -1.42 };
    assert.equal(cameraFramesPoint(opened, { latitude: -1.45, longitude: -48.49 }), false);
  });

  it('accepts a close view centered on the pin', () => {
    const close: MapBounds = { west: -48.46, south: -1.41, east: -48.44, north: -1.39 };
    assert.equal(cameraFramesPoint(close, pin), true);
  });

  it('accepts the pin zoom on a wide phone', () => {
    const phone: MapBounds = { west: -48.47, south: -1.42, east: -48.43, north: -1.38 };
    assert.equal(cameraFramesPoint(phone, pin), true);
  });

  it('rejects a close view aimed somewhere else', () => {
    const elsewhere: MapBounds = { west: -48.2, south: -1.2, east: -48.18, north: -1.18 };
    assert.equal(cameraFramesPoint(elsewhere, pin), false);
  });
});
