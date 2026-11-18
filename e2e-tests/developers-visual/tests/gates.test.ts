import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipRect,
  crop,
  diffImages,
  gateGeometry,
  gatePixels,
  gateStyles,
  keysInside,
  normalizeCss,
  paintRects,
  type ElementSample,
} from '../gates.ts';
import { decodePng, encodePng, samePixels, type RGBAImage } from '../png.ts';
import { GATE1_PROPS } from '../mapped-elements.ts';

function solid(width: number, height: number, rgb: [number, number, number]): RGBAImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...rgb, 255], i * 4);
  return { width, height, data };
}

const sample = (rect: [number, number, number, number], style: Record<string, string> = {}): ElementSample => ({
  rect,
  style,
});

test('gate 1: equal styles pass, font family is exempt', () => {
  const base = { h1: sample([0, 0, 10, 10], { fontSize: '31px', fontFamily: 'system-ui', color: 'rgb(50, 52, 58)' }) };
  const act = { h1: sample([0, 0, 10, 10], { fontSize: '31px', fontFamily: 'Roboto', color: 'rgb(50,52,58)' }) };
  assert.deepEqual(gateStyles(base, act, ['fontSize', 'fontFamily', 'color']), []);
});

test('gate 1: a differing property and a missing element are reported', () => {
  const base = {
    h1: sample([0, 0, 1, 1], { fontSize: '31px', fontWeight: '600' }),
    tryIt: sample([0, 0, 1, 1], { color: 'rgb(255, 255, 255)' }),
  };
  const act = { h1: sample([0, 0, 1, 1], { fontSize: '30px', fontWeight: '600' }) };
  const f = gateStyles(base, act, ['fontSize', 'fontWeight', 'color']);
  assert.deepEqual(
    f.map((x) => `${x.key}.${x.prop}`),
    ['h1.fontSize', 'tryIt.(element)']
  );
});

test('gate 1: skipped keys are not compared; GATE1_PROPS leaves out font family', () => {
  const base = { a: sample([0, 0, 1, 1], { fontSize: '1px' }) };
  assert.deepEqual(gateStyles(base, {}, ['fontSize'], new Set(['a'])), []);
  assert.ok(!GATE1_PROPS.includes('fontFamily'));
  assert.ok(GATE1_PROPS.includes('paddingTop') && GATE1_PROPS.includes('borderTopLeftRadius'));
});

test('normalizeCss rounds sub-pixel lengths and spacing', () => {
  assert.equal(normalizeCss('rgba(0,0,0,0.1)'), normalizeCss('rgba(0, 0, 0, 0.1)'));
  assert.equal(normalizeCss('18.200001px'), '18.2px');
});

test('gate 2: within 0.5px passes, beyond fails with the delta', () => {
  const base = { a: sample([10, 10, 100, 20]), b: sample([0, 0, 50, 50]) };
  const act = { a: sample([10.4, 10, 100.5, 20]), b: sample([0, 3, 50, 50]) };
  const f = gateGeometry(base, act, 0.5);
  assert.equal(f.length, 1);
  assert.equal(f[0].key, 'b');
  assert.equal(f[0].delta, 3);
});

test('gate 2: a missing element fails', () => {
  const f = gateGeometry({ a: sample([0, 0, 1, 1]) }, {});
  assert.equal(f[0].actual, null);
});

test('keysInside finds elements under deviation masks', () => {
  const s = { in: sample([5, 5, 2, 2]), out: sample([50, 50, 2, 2]) };
  assert.deepEqual([...keysInside(s, [[0, 0, 10, 10]])], ['in']);
});

test('gate 3: identical images pass', () => {
  const a = solid(20, 10, [200, 200, 200]);
  const r = gatePixels(a, solid(20, 10, [200, 200, 200]), [
    { id: 'all', baseline: [0, 0, 20, 10], actual: [0, 0, 20, 10] },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.viewport.ratio, 0);
});

test('gate 3: small colour changes under the 0.2 threshold do not count', () => {
  const d = diffImages(solid(4, 4, [100, 100, 100]), solid(4, 4, [103, 100, 100]));
  assert.equal(d.diff, 0);
});

test('gate 3: region limit 1.0% and viewport limit 0.5%', () => {
  const base = solid(100, 100, [255, 255, 255]);
  const act = solid(100, 100, [255, 255, 255]);
  // 60 differing pixels inside a 100×50 region: 1.2% of the region, 0.6% of the viewport.
  paintRects(act, [[0, 0, 60, 1]], [0, 0, 0]);
  const r = gatePixels(base, act, [{ id: 'top', baseline: [0, 0, 100, 50], actual: [0, 0, 100, 50] }]);
  assert.equal(r.regions[0].ok, false);
  assert.ok(Math.abs(r.regions[0].ratio - 0.012) < 1e-9);
  assert.equal(r.viewport.ok, false);
  // 40 pixels: 0.8% of the region (passes), 0.4% of the viewport (passes).
  const act2 = solid(100, 100, [255, 255, 255]);
  paintRects(act2, [[0, 0, 40, 1]], [0, 0, 0]);
  const r2 = gatePixels(base, act2, [{ id: 'top', baseline: [0, 0, 100, 50], actual: [0, 0, 100, 50] }]);
  assert.equal(r2.ok, true);
});

test('gate 3: masks painted on both sides hide differences', () => {
  const base = solid(10, 10, [255, 255, 255]);
  const act = solid(10, 10, [255, 255, 255]);
  paintRects(act, [[2, 2, 3, 3]], [0, 0, 0]);
  const r = gatePixels(base, act, [], { masks: [[2, 2, 3, 3]] });
  assert.equal(r.viewport.ratio, 0);
});

test('gate 3: per-region override (D-12 uses 2%)', () => {
  const base = solid(100, 10, [255, 255, 255]);
  const act = solid(100, 10, [255, 255, 255]);
  paintRects(act, [[0, 0, 15, 1]], [0, 0, 0]); // 1.5%
  const r = gatePixels(
    base,
    act,
    [{ id: 'html', baseline: [0, 0, 100, 10], actual: [0, 0, 100, 10], maxDiffRatio: 0.02 }],
    {
      viewportMaxDiffRatio: 1,
    }
  );
  assert.equal(r.regions[0].ok, true);
});

test('gate 3: a region missing on one side fails', () => {
  const a = solid(4, 4, [0, 0, 0]);
  const r = gatePixels(a, a, [{ id: 'popover', baseline: [0, 0, 2, 2], actual: null }]);
  assert.equal(r.regions[0].ok, false);
  assert.equal(r.regions[0].missing, 'actual');
});

test('gate 3: regions are cropped by each side’s own box', () => {
  const base = solid(20, 20, [255, 255, 255]);
  const act = solid(20, 20, [255, 255, 255]);
  paintRects(base, [[0, 0, 5, 5]], [0, 0, 255]);
  paintRects(act, [[3, 3, 5, 5]], [0, 0, 255]);
  const r = gatePixels(base, act, [{ id: 'card', baseline: [0, 0, 5, 5], actual: [3, 3, 5, 5] }], {
    viewportMaxDiffRatio: 1,
  });
  assert.equal(r.regions[0].ratio, 0);
});

test('size mismatch counts the non-overlapping area as different', () => {
  const d = diffImages(solid(10, 10, [0, 0, 0]), solid(10, 12, [0, 0, 0]));
  assert.equal(d.diff, 20);
  assert.equal(d.total, 120);
});

test('clipRect and crop clip to the image', () => {
  assert.deepEqual(clipRect([-5, -5, 10, 10], 4, 4), [0, 0, 4, 4]);
  assert.equal(clipRect([10, 10, 5, 5], 4, 4), null);
  assert.equal(crop(solid(4, 4, [1, 2, 3]), [2, 2, 10, 10]).width, 2);
});

test('PNG round trip is lossless (RGB and RGBA)', () => {
  const img = solid(7, 5, [10, 20, 30]);
  for (let i = 0; i < img.data.length; i += 4) img.data[i] = (i * 13) & 0xff;
  assert.ok(samePixels(decodePng(encodePng(img)), img));
  img.data[3] = 128;
  assert.ok(samePixels(decodePng(encodePng(img)), img));
});
