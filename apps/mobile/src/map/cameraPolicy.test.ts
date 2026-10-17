import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  USER_ZOOM,
  initialCameraState,
  reduceCamera,
  type CameraState,
  type LngLat,
  type MapBounds,
} from './cameraPolicy.ts';

const home: LngLat = [-48.5, -1.45];
const moved: LngLat = [-48.4, -1.4];
const pin: LngLat = [-48.47, -1.46];

const view: MapBounds = { west: -48.55, south: -1.5, east: -48.45, north: -1.4 };
const far: MapBounds = { west: -48.3, south: -1.3, east: -48.2, north: -1.2 };

function at(state: CameraState, point: LngLat, inside = true) {
  return reduceCamera(state, { type: 'gps', point, inside });
}

describe('map camera', () => {
  it('centers once on the first fix inside the city and ignores the next fixes', () => {
    const first = at(initialCameraState, home);
    assert.deepEqual(first.move, { center: home, zoom: USER_ZOOM, reason: 'initial' });
    const second = at(first.state, moved);
    assert.equal(second.move, null);
    assert.deepEqual(second.state.user, moved);
    const third = at(second.state, home);
    assert.equal(third.move, null);
  });

  it('does not center on a fix outside the city, then centers on the first one inside', () => {
    const outside = at(initialCameraState, [0, 0], false);
    assert.equal(outside.move, null);
    assert.equal(outside.state.centered, false);
    const inside = at(outside.state, home);
    assert.equal(inside.move?.reason, 'initial');
  });

  it('does not pull the camera back if the user already dragged before the fix', () => {
    const dragged = reduceCamera(initialCameraState, { type: 'gesture' });
    assert.equal(dragged.move, null);
    const late = at(dragged.state, home);
    assert.equal(late.move, null);
    assert.deepEqual(late.state.user, home);
  });

  it('does not move when the list, the filter or the screen focus change', () => {
    let state = at(initialCameraState, home).state;
    for (const event of [
      { type: 'data' as const },
      { type: 'data' as const },
      { type: 'dismissPin' as const },
    ]) {
      const step = reduceCamera(state, event);
      assert.equal(step.move, null);
      state = step.state;
    }
  });

  it('centers on every tap of Minha localização and never follows the person afterwards', () => {
    const ready = at(initialCameraState, home).state;
    const firstTap = reduceCamera(ready, { type: 'locate' });
    assert.deepEqual(firstTap.move, { center: home, zoom: USER_ZOOM, reason: 'locate' });
    const walked = at(firstTap.state, moved);
    assert.equal(walked.move, null);
    const secondTap = reduceCamera(walked.state, { type: 'locate' });
    assert.deepEqual(secondTap.move, { center: moved, zoom: USER_ZOOM, reason: 'locate' });
    assert.equal(at(secondTap.state, home).move, null);
  });

  it('keeps the camera where the person left it after a touch on the map', () => {
    const ready = at(initialCameraState, home).state;
    const touched = reduceCamera(ready, { type: 'gesture' });
    assert.equal(touched.move, null);
    for (const point of [moved, home, moved]) {
      assert.equal(at(touched.state, point).move, null);
    }
  });

  it('locate without a fix does not move the camera', () => {
    assert.equal(reduceCamera(initialCameraState, { type: 'locate' }).move, null);
  });

  it('frames a pin and does not move when the card closes', () => {
    const ready = at(initialCameraState, home).state;
    const framed = reduceCamera(ready, { type: 'pin', point: pin });
    assert.deepEqual(framed.move, { center: pin, zoom: 15, reason: 'pin' });
    const closed = reduceCamera(framed.state, { type: 'dismissPin' });
    assert.equal(closed.move, null);
    assert.equal(at(closed.state, moved).move, null);
  });

  it('loads the area as soon as the camera settles, including a pan', () => {
    const opened = reduceCamera(initialCameraState, {
      type: 'region',
      bounds: view,
      fromUser: false,
    });
    assert.equal(opened.move, null);
    assert.equal(opened.state.userMoved, false);
    assert.deepEqual(opened.state.loaded, view);
    const pan = reduceCamera(opened.state, { type: 'region', bounds: far, fromUser: true });
    assert.equal(pan.move, null);
    assert.equal(pan.state.userMoved, true);
    assert.deepEqual(pan.state.loaded, far);
  });

  it('a denied or disabled GPS leaves the camera on the city default', () => {
    const step = reduceCamera(initialCameraState, { type: 'gpsUnavailable' });
    assert.equal(step.move, null);
    assert.equal(step.state.centered, true);
    assert.equal(at(step.state, home).move, null);
  });
});
