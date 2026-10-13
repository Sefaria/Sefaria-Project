/**
 * Turn a list of "where was the element on each animation frame" samples into
 * simple facts a test can assert on: did it bounce, how many times, how high,
 * how long did a slide take, did it jump or glide.
 *
 * The samples come from LibraryAssistantQ4Page, which records an element's
 * position once per browser animation frame (~every 16 ms) for a fixed time.
 * Measuring the *position* (rather than reading CSS animation settings) keeps
 * the tests about what a visitor sees, whatever way the animation is built.
 */

export interface RectSample {
  /** Milliseconds since sampling started. */
  t: number;
  top: number | null;
  bottom: number | null;
  left: number | null;
  right: number | null;
  innerHeight: number;
  innerWidth: number;
}

export interface BounceReport {
  /** How many separate times the element rose 4px or more above its resting place. */
  riseCount: number;
  /** The highest it rose, in px. */
  maxRise: number;
  /** For each big rise, the height of the small "hop" that followed it (0 if none). */
  hopHeights: number[];
  /** For each big rise, ms from leaving rest until it came back to rest after the hop. */
  bounceDurations: number[];
  /** True when it did not move at all during the final 400 ms. */
  stillAtEnd: boolean;
}

/** `up` = how many px above its final resting place the element's top edge was. */
function risePoints(samples: RectSample[]): { t: number; up: number }[] {
  const points = samples.filter((s) => s.top !== null) as Array<RectSample & { top: number }>;
  if (points.length === 0) return [];
  const rest = points[points.length - 1].top;
  return points.map((s) => ({ t: s.t, up: rest - s.top }));
}

export function analyzeBounces(samples: RectSample[]): BounceReport {
  const pts = risePoints(samples);
  const report: BounceReport = { riseCount: 0, maxRise: 0, hopHeights: [], bounceDurations: [], stillAtEnd: true };
  if (pts.length === 0) return report;

  report.maxRise = Math.max(...pts.map((p) => p.up));
  const lastT = pts[pts.length - 1].t;
  report.stillAtEnd = pts.filter((p) => p.t > lastT - 400).every((p) => Math.abs(p.up) < 0.5);

  // Indexes where a big rise (>= 4px) begins.
  const riseStarts: number[] = [];
  let inRise = false;
  pts.forEach((p, i) => {
    if (!inRise && p.up >= 4) { riseStarts.push(i); inRise = true; }
    else if (inRise && p.up < 1) { inRise = false; }
  });
  report.riseCount = riseStarts.length;

  riseStarts.forEach((startIdx, k) => {
    const nextRise = k + 1 < riseStarts.length ? riseStarts[k + 1] : pts.length;
    // Walk back to the moment it left its resting place.
    let leave = startIdx;
    while (leave > 0 && pts[leave - 1].up > 0.5) leave--;
    // Past the big peak: first time it comes back down below 1px.
    let i = startIdx;
    while (i < nextRise && pts[i].up >= 1) i++;
    // Then the hop: the highest point before the next big rise.
    let hop = 0;
    let hopIdx = -1;
    for (let j = i; j < nextRise; j++) {
      if (pts[j].up > hop) { hop = pts[j].up; hopIdx = j; }
    }
    report.hopHeights.push(hop >= 1 ? hop : 0);
    // The bounce ends when it is back at rest after the hop (or after the big rise if no hop).
    let end = hop >= 1 ? hopIdx : i;
    while (end < pts.length - 1 && pts[end].up > 0.5) end++;
    report.bounceDurations.push(pts[end].t - pts[leave].t);
  });
  return report;
}

export interface SlideReport {
  startValue: number;
  endValue: number;
  /** Frames caught strictly between the start and end values — 0 means it jumped. */
  inBetweenFrames: number;
  /** ms from first leaving the start value to first reaching the end value. */
  durationMs: number;
}

/** Describe how a single number (e.g. a gap in px) moved from its first value to its last. */
export function analyzeSlide(values: { t: number; v: number }[]): SlideReport {
  if (values.length === 0) {
    return { startValue: NaN, endValue: NaN, inBetweenFrames: 0, durationMs: 0 };
  }
  const startValue = values[0].v;
  const endValue = values[values.length - 1].v;
  const leftStart = values.findIndex((p) => Math.abs(p.v - startValue) > 0.5);
  const reachedEnd = values.findIndex((p) => Math.abs(p.v - endValue) <= 0.5);
  const lo = Math.min(startValue, endValue) + 0.5;
  const hi = Math.max(startValue, endValue) - 0.5;
  const inBetweenFrames = values.filter((p) => p.v > lo && p.v < hi).length;
  // `leftStart` is the first frame that already moved, so step one frame back for the start time.
  const startT = leftStart > 0 ? values[leftStart - 1].t : values[0].t;
  const durationMs = reachedEnd >= 0 ? values[reachedEnd].t - startT : Infinity;
  return { startValue, endValue, inBetweenFrames, durationMs };
}
