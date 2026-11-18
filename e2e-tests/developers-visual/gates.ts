/**
 * The three gates of PLAN.md §6.1.4, as pure functions (no browser, no file system).
 *
 * 1. Computed styles: every mapped element present in the baseline metrics has the same font size,
 *    weight, line height, color, background, padding, margin, border and radius on the portal.
 *    Font family is exempt (D-1).
 * 2. Geometry: the bounding box of each mapped element is within 0.5px of the baseline's.
 * 3. Pixels: per region at most 1.0% of pixels differ, per viewport at most 0.5%, at a per-pixel
 *    colour threshold of 0.2 (pixelmatch's YIQ metric; anti-aliased pixels are not counted, as in
 *    Playwright's `toHaveScreenshot`).
 */
import type { RGBAImage } from './png.ts';

export type Rect = [x: number, y: number, width: number, height: number];

export const DEFAULT_LIMITS = {
  geometryTolerancePx: 0.5,
  pixelThreshold: 0.2,
  regionMaxDiffRatio: 0.01,
  viewportMaxDiffRatio: 0.005,
} as const;

export interface ElementSample {
  rect: Rect;
  style: Record<string, string>;
}

// ----------------------------------------------------------------------------- gate 1

export interface StyleFailure {
  key: string;
  prop: string;
  expected: string;
  actual: string | null;
}

/**
 * Normalise a computed value for comparison. Both sides come from Chromium's getComputedStyle, so
 * only whitespace around commas and case can differ; lengths are rounded to 1/100 px.
 */
export function normalizeCss(value: string): string {
  return value
    .trim()
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/(\d+\.\d+)px/g, (_, n: string) => `${Math.round(Number(n) * 100) / 100}px`)
    .toLowerCase();
}

export function gateStyles(
  baseline: Record<string, ElementSample>,
  actual: Record<string, ElementSample>,
  props: readonly string[],
  skipKeys: ReadonlySet<string> = new Set()
): StyleFailure[] {
  const failures: StyleFailure[] = [];
  for (const [key, base] of Object.entries(baseline)) {
    if (skipKeys.has(key)) continue;
    const act = actual[key];
    if (!act) {
      failures.push({ key, prop: '(element)', expected: 'present', actual: null });
      continue;
    }
    for (const prop of props) {
      if (prop === 'fontFamily') continue; // D-1
      const e = base.style[prop];
      if (e === undefined) continue;
      const a = act.style[prop];
      if (a === undefined || normalizeCss(a) !== normalizeCss(e))
        failures.push({ key, prop, expected: e, actual: a ?? null });
    }
  }
  return failures;
}

// ----------------------------------------------------------------------------- gate 2

export interface GeometryFailure {
  key: string;
  expected: Rect;
  actual: Rect | null;
  /** Largest absolute difference across x, y, width, height. */
  delta: number;
}

export function gateGeometry(
  baseline: Record<string, ElementSample>,
  actual: Record<string, ElementSample>,
  tolerance: number = DEFAULT_LIMITS.geometryTolerancePx,
  skipKeys: ReadonlySet<string> = new Set()
): GeometryFailure[] {
  const failures: GeometryFailure[] = [];
  for (const [key, base] of Object.entries(baseline)) {
    if (skipKeys.has(key)) continue;
    const act = actual[key];
    if (!act) {
      failures.push({ key, expected: base.rect, actual: null, delta: Infinity });
      continue;
    }
    const delta = Math.max(...base.rect.map((v, i) => Math.abs(v - act.rect[i])));
    if (delta > tolerance) failures.push({ key, expected: base.rect, actual: act.rect, delta });
  }
  return failures;
}

/** Keys whose baseline rect lies inside (overlaps) any of the given rects; used to skip masked elements. */
export function keysInside(samples: Record<string, ElementSample>, rects: readonly Rect[]): Set<string> {
  const out = new Set<string>();
  for (const [key, s] of Object.entries(samples)) if (rects.some((r) => intersects(s.rect, r))) out.add(key);
  return out;
}

// ----------------------------------------------------------------------------- gate 3

function intersects(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

/** Integer pixel rect clipped to the image, or null when nothing is left. */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r[0]));
  const y0 = Math.max(0, Math.floor(r[1]));
  const x1 = Math.min(width, Math.ceil(r[0] + r[2]));
  const y1 = Math.min(height, Math.ceil(r[1] + r[3]));
  if (x1 <= x0 || y1 <= y0) return null;
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Paint rectangles with a solid colour, in place (mask application). */
export function paintRects(
  img: RGBAImage,
  rects: readonly Rect[],
  rgb: [number, number, number] = [255, 0, 255]
): void {
  for (const r of rects) {
    const c = clipRect(r, img.width, img.height);
    if (!c) continue;
    for (let y = c[1]; y < c[1] + c[3]; y++)
      for (let x = c[0]; x < c[0] + c[2]; x++) {
        const o = (y * img.width + x) * 4;
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = 255;
      }
  }
}

/** Crop a rect out of an image (clipped). */
export function crop(img: RGBAImage, r: Rect): RGBAImage {
  const c = clipRect(r, img.width, img.height) ?? [0, 0, 0, 0];
  const data = new Uint8Array(c[2] * c[3] * 4);
  for (let y = 0; y < c[3]; y++) {
    const from = ((c[1] + y) * img.width + c[0]) * 4;
    data.set(img.data.subarray(from, from + c[2] * 4), y * c[2] * 4);
  }
  return { width: c[2], height: c[3], data };
}

// pixelmatch (MIT, Mapbox) colour metric and anti-aliasing detection, re-implemented.
function blend(c: number, a: number): number {
  return 255 + (c - 255) * a;
}
function rgb2y(r: number, g: number, b: number) {
  return r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
}
function rgb2i(r: number, g: number, b: number) {
  return r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
}
function rgb2q(r: number, g: number, b: number) {
  return r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
}

/** Squared YIQ distance between pixel k of a and pixel m of b (alpha blended on white). */
export function colorDelta(a: Uint8Array, b: Uint8Array, k: number, m: number, yOnly = false): number {
  let r1 = a[k],
    g1 = a[k + 1],
    b1 = a[k + 2];
  let r2 = b[m],
    g2 = b[m + 1],
    b2 = b[m + 2];
  const a1 = a[k + 3],
    a2 = b[m + 3];
  if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;
  if (a1 < 255) {
    const f = a1 / 255;
    r1 = blend(r1, f);
    g1 = blend(g1, f);
    b1 = blend(b1, f);
  }
  if (a2 < 255) {
    const f = a2 / 255;
    r2 = blend(r2, f);
    g2 = blend(g2, f);
    b2 = blend(b2, f);
  }
  const y1 = rgb2y(r1, g1, b1),
    y2 = rgb2y(r2, g2, b2);
  const y = y1 - y2;
  if (yOnly) return y;
  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
  return y1 > y2 ? -delta : delta;
}

function hasManySiblings(img: Uint8Array, x1: number, y1: number, width: number, height: number): boolean {
  const x0 = Math.max(x1 - 1, 0),
    y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1),
    y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  for (let x = x0; x <= x2; x++)
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const pos2 = (y * width + x) * 4;
      if (
        img[pos] === img[pos2] &&
        img[pos + 1] === img[pos2 + 1] &&
        img[pos + 2] === img[pos2 + 2] &&
        img[pos + 3] === img[pos2 + 3]
      )
        zeroes++;
      if (zeroes > 2) return true;
    }
  return false;
}

/** pixelmatch's anti-aliasing test for pixel (x1, y1) of img against img2. */
export function antialiased(
  img: Uint8Array,
  x1: number,
  y1: number,
  width: number,
  height: number,
  img2: Uint8Array
): boolean {
  const x0 = Math.max(x1 - 1, 0),
    y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1),
    y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0,
    max = 0,
    minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
  for (let x = x0; x <= x2; x++)
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);
      if (delta === 0) {
        zeroes++;
        if (zeroes > 2) return false;
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  if (min === 0 || max === 0) return false;
  return (
    (hasManySiblings(img, minX, minY, width, height) && hasManySiblings(img2, minX, minY, width, height)) ||
    (hasManySiblings(img, maxX, maxY, width, height) && hasManySiblings(img2, maxX, maxY, width, height))
  );
}

export interface PixelDiff {
  width: number;
  height: number;
  /** Pixels compared (the larger of the two areas; area present in only one image counts as differing). */
  total: number;
  diff: number;
  ratio: number;
  /** 1 where a pixel differs, row-major over width × height. */
  mask: Uint8Array;
}

/**
 * Count differing pixels between two images aligned at their top-left corner. When sizes differ,
 * the area outside the overlap counts as differing.
 */
export function diffImages(a: RGBAImage, b: RGBAImage, threshold: number = DEFAULT_LIMITS.pixelThreshold): PixelDiff {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const ow = Math.min(a.width, b.width);
  const oh = Math.min(a.height, b.height);
  const mask = new Uint8Array(width * height);
  const maxDelta = 35215 * threshold * threshold;
  let diff = 0;
  // Work on overlap-sized copies so the AA test sees consistent neighbours.
  const A = ow === a.width && oh === a.height ? a : crop(a, [0, 0, ow, oh]);
  const B = ow === b.width && oh === b.height ? b : crop(b, [0, 0, ow, oh]);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const pos = (y * ow + x) * 4;
      const delta = colorDelta(A.data, B.data, pos, pos);
      if (Math.abs(delta) > maxDelta) {
        if (antialiased(A.data, x, y, ow, oh, B.data) || antialiased(B.data, x, y, ow, oh, A.data)) continue;
        mask[y * width + x] = 1;
        diff++;
      }
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x >= ow || y >= oh) {
        mask[y * width + x] = 1;
        diff++;
      }
  const total = width * height;
  return { width, height, total, diff, ratio: total ? diff / total : 0, mask };
}

export interface RegionInput {
  id: string;
  /** Region box on the baseline image and on the portal image (screenshot coordinates). */
  baseline: Rect | null;
  actual: Rect | null;
  maxDiffRatio?: number;
}

export interface RegionResult {
  id: string;
  ok: boolean;
  ratio: number;
  limit: number;
  /** Set when the region is missing on one side. */
  missing?: 'baseline' | 'actual';
}

export interface PixelGateResult {
  ok: boolean;
  viewport: { ok: boolean; ratio: number; limit: number };
  regions: RegionResult[];
}

/**
 * Gate 3. `masks` are rectangles already painted on both images by the caller (or pass them here
 * to have them painted on copies). Regions are cropped by each side's own box, so a region that
 * moved is still compared on content (gate 2 reports the move).
 */
export function gatePixels(
  baseline: RGBAImage,
  actual: RGBAImage,
  regions: readonly RegionInput[],
  opts: {
    masks?: readonly Rect[];
    threshold?: number;
    regionMaxDiffRatio?: number;
    viewportMaxDiffRatio?: number;
    exemptViewport?: boolean;
  } = {}
): PixelGateResult {
  const threshold = opts.threshold ?? DEFAULT_LIMITS.pixelThreshold;
  const regionLimit = opts.regionMaxDiffRatio ?? DEFAULT_LIMITS.regionMaxDiffRatio;
  const viewportLimit = opts.viewportMaxDiffRatio ?? DEFAULT_LIMITS.viewportMaxDiffRatio;
  let base = baseline;
  let act = actual;
  if (opts.masks?.length) {
    base = { ...baseline, data: new Uint8Array(baseline.data) };
    act = { ...actual, data: new Uint8Array(actual.data) };
    paintRects(base, opts.masks);
    paintRects(act, opts.masks);
  }
  const whole = diffImages(base, act, threshold);
  const viewport = {
    ok: opts.exemptViewport ? true : whole.ratio <= viewportLimit,
    ratio: whole.ratio,
    limit: viewportLimit,
  };
  const results: RegionResult[] = regions.map((r) => {
    const limit = r.maxDiffRatio ?? regionLimit;
    if (!r.baseline) return { id: r.id, ok: false, ratio: 1, limit, missing: 'baseline' as const };
    if (!r.actual) return { id: r.id, ok: false, ratio: 1, limit, missing: 'actual' as const };
    const d = diffImages(crop(base, r.baseline), crop(act, r.actual), threshold);
    return { id: r.id, ok: d.ratio <= limit, ratio: d.ratio, limit };
  });
  return { ok: viewport.ok && results.every((r) => r.ok), viewport, regions: results };
}

/** A visual diff image: unchanged pixels faded, differing pixels red (for PX evidence). */
export function diffImage(baseline: RGBAImage, d: PixelDiff): RGBAImage {
  const out = new Uint8Array(d.width * d.height * 4);
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < d.width; x++) {
      const o = (y * d.width + x) * 4;
      if (d.mask[y * d.width + x]) {
        out[o] = 255;
        out[o + 1] = 0;
        out[o + 2] = 0;
      } else if (x < baseline.width && y < baseline.height) {
        const s = (y * baseline.width + x) * 4;
        const g = 255 - (255 - rgb2y(baseline.data[s], baseline.data[s + 1], baseline.data[s + 2])) * 0.1;
        out[o] = out[o + 1] = out[o + 2] = g;
      } else out[o] = out[o + 1] = out[o + 2] = 255;
      out[o + 3] = 255;
    }
  return { width: d.width, height: d.height, data: out };
}
