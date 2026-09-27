import {
  classifyDrag, createSwipeTracker, openingSign, PANEL, panelForDrag, panelOffset, panelSide, settleDuration,
  startsInEdgeZone, swipeDirection, SWIPE,
} from '../gestures';

const W = 390;
const PANEL_W = 346;

/** Drive a tracker through a drag: points are [x, y, t]. Returns [every move state, the end result]. */
function drag(points, {dir = 'ltr', openPanel = null} = {}) {
  const tracker = createSwipeTracker({dir, viewportWidth: W, panelWidth: () => PANEL_W, openPanel});
  const [x0, y0, t0 = 0] = points[0];
  const started = tracker.start({x: x0, y: y0, t: t0});
  const states = points.slice(1).map(([x, y, t]) => tracker.move({x, y, t}));
  const [xe, ye, te] = points[points.length - 1];
  return {started, states, last: states[states.length - 1], result: tracker.end({x: xe, y: ye, t: te})};
}

/** A steady drag from x0 to x1 over `ms`, sampled every 16ms. */
function steady(x0, x1, ms, {y = 400, dy = 0} = {}) {
  const points = [];
  for (let t = 0; t <= ms; t += 16) {
    const f = t / ms;
    points.push([x0 + (x1 - x0) * f, y + dy * f, t]);
  }
  if (points[points.length - 1][2] !== ms) { points.push([x1, y + dy, ms]); }
  return points;
}

describe('horizontal swipes start anywhere on the text except the edge zones', () => {
  test('edge zones on both sides are reserved for the OS back gesture', () => {
    expect(startsInEdgeZone(5, W)).toBe(true);
    expect(startsInEdgeZone(W - 5, W)).toBe(true);
    expect(startsInEdgeZone(W / 2, W)).toBe(false);
    expect(startsInEdgeZone(SWIPE.edgeZone, W)).toBe(false);
    expect(startsInEdgeZone(W - SWIPE.edgeZone, W)).toBe(false);
    expect(classifyDrag({x: 10, y: 300}, {x: 120, y: 300}, W)).toBe('ignored');
  });

  test('a drag starting in either edge zone never becomes a swipe', () => {
    for (const x of [4, SWIPE.edgeZone - 1, W - SWIPE.edgeZone + 1, W - 2]) {
      const {started, result, last} = drag(steady(x, x < W / 2 ? x + 250 : x - 250, 200));
      expect(started).toBe(false);
      expect(last.phase).toBe('ignored');
      expect(result.action).toBe('none');
    }
  });

  test('the axis locks once the finger has travelled far enough', () => {
    expect(classifyDrag({x: 200, y: 300}, {x: 204, y: 302}, W)).toBe('pending');
    expect(classifyDrag({x: 200, y: 300}, {x: 240, y: 305}, W)).toBe('horizontal');
    expect(classifyDrag({x: 200, y: 300}, {x: 212, y: 340}, W)).toBe('vertical');
    // Diagonal drags scroll the page: horizontal needs a clear majority.
    expect(classifyDrag({x: 200, y: 300}, {x: 230, y: 325}, W)).toBe('vertical');
  });

  test('directions are logical and mirror in a Hebrew interface', () => {
    const far = SWIPE.commitDistance + 1;
    expect(swipeDirection(far, 'ltr')).toBe('toTrailing');
    expect(swipeDirection(-far, 'ltr')).toBe('toLeading');
    expect(swipeDirection(far, 'rtl')).toBe('toLeading');
    expect(swipeDirection(-far, 'rtl')).toBe('toTrailing');
    expect(swipeDirection(SWIPE.commitDistance - 1, 'ltr')).toBeNull();
  });
});

describe('which panel a drag opens, and where it sits', () => {
  test('English: right-to-left opens associated texts (from the right), left-to-right opens config (from the left)', () => {
    expect(panelForDrag(-80, 'ltr')).toBe(PANEL.ASSOCIATED);
    expect(panelForDrag(80, 'ltr')).toBe(PANEL.CONFIG);
    expect(panelSide(PANEL.ASSOCIATED, 'ltr')).toBe('right');
    expect(panelSide(PANEL.CONFIG, 'ltr')).toBe('left');
  });

  test('Hebrew interface: everything mirrors', () => {
    expect(panelForDrag(80, 'rtl')).toBe(PANEL.ASSOCIATED);
    expect(panelForDrag(-80, 'rtl')).toBe(PANEL.CONFIG);
    expect(panelSide(PANEL.ASSOCIATED, 'rtl')).toBe('left');
    expect(panelSide(PANEL.CONFIG, 'rtl')).toBe('right');
  });

  test('the panel sits off screen on its own side when closed and at 0 when open', () => {
    expect(openingSign(PANEL.ASSOCIATED, 'ltr')).toBe(-1);
    expect(panelOffset(PANEL.ASSOCIATED, 'ltr', 0, 300)).toBe(300);
    expect(panelOffset(PANEL.ASSOCIATED, 'ltr', 0.5, 300)).toBe(150);
    expect(panelOffset(PANEL.ASSOCIATED, 'ltr', 1, 300)).toBe(0);
    expect(panelOffset(PANEL.CONFIG, 'ltr', 0, 300)).toBe(-300);
    expect(panelOffset(PANEL.ASSOCIATED, 'rtl', 0, 300)).toBe(-300);
    expect(panelOffset(PANEL.CONFIG, 'rtl', 0.25, 300)).toBe(225);
  });
});

describe('the interactive drag: the panel follows the finger', () => {
  test('progress tracks travel over the panel width, in the opening direction only', () => {
    const {states} = drag([[300, 400, 0], [290, 401, 16], [300 - PANEL_W / 2, 402, 100], [320, 402, 150]]);
    expect(states[0].phase).toBe('dragging');
    expect(states[0].panel).toBe(PANEL.ASSOCIATED);
    expect(states[1].progress).toBeCloseTo(0.5, 5);
    expect(states[2].progress).toBe(0);  // back past the start: clamped, the panel doesn't reverse into config
    expect(states[2].panel).toBe(PANEL.ASSOCIATED);
  });

  test('a slow drag commits past the open fraction and settles back before it', () => {
    const past = PANEL_W * (SWIPE.openFraction + 0.05);
    const short = PANEL_W * (SWIPE.openFraction - 0.1);
    expect(drag(steady(300, 300 - past, 900)).result).toMatchObject({action: 'open', panel: PANEL.ASSOCIATED});
    expect(drag(steady(300, 300 - short, 900)).result).toMatchObject({action: 'cancel', panel: PANEL.ASSOCIATED});
  });

  test('a fling opens even when short, and a fling back cancels even when far', () => {
    const fling = drag(steady(300, 240, 80));  // 60px in 80ms = 0.75 px/ms
    expect(fling.result.action).toBe('open');
    expect(fling.result.velocity).toBeGreaterThan(SWIPE.flingVelocity);
    // Far in, then a quick flick back toward the edge.
    const points = [...steady(300, 100, 600), [140, 400, 616], [190, 400, 632], [240, 400, 648]];
    const back = drag(points);
    expect(back.result.velocity).toBeLessThan(-SWIPE.flingVelocity);
    expect(back.result.action).toBe('cancel');
  });

  test('a tiny fast flick below the minimum travel is not a fling', () => {
    // 11px in 16ms locks horizontal but is too short to count as a fling or a drag.
    expect(drag([[300, 400, 0], [289, 400, 16]]).result.action).toBe('cancel');
  });

  test('left-to-right in English opens config; mirrored in Hebrew', () => {
    expect(drag(steady(80, 300, 300)).result).toMatchObject({action: 'open', panel: PANEL.CONFIG});
    expect(drag(steady(80, 300, 300), {dir: 'rtl'}).result).toMatchObject({action: 'open', panel: PANEL.ASSOCIATED});
    expect(drag(steady(300, 80, 300), {dir: 'rtl'}).result).toMatchObject({action: 'open', panel: PANEL.CONFIG});
  });

  test('direction lock: a vertical scroll stays a scroll, whatever the finger does next', () => {
    const {states, result} = drag([[200, 400, 0], [203, 380, 16], [205, 330, 32], [60, 320, 64]]);
    expect(states.map(s => s.phase)).toEqual(['vertical', 'vertical', 'vertical']);
    expect(result.action).toBe('none');
  });

  test('a long press followed by a drag is a text selection, not a swipe', () => {
    const {last, result} = drag([[250, 400, 0], [251, 400, 300], [252, 401, SWIPE.longPressMs + 50], [150, 402, SWIPE.longPressMs + 120]]);
    expect(last.phase).toBe('ignored');
    expect(result.action).toBe('none');
  });

  test('a cancelled pointer (the browser took over) settles back', () => {
    const tracker = createSwipeTracker({dir: 'ltr', viewportWidth: W, panelWidth: () => PANEL_W});
    tracker.start({x: 300, y: 400, t: 0});
    tracker.move({x: 200, y: 400, t: 50});
    expect(tracker.cancel()).toMatchObject({action: 'cancel', panel: PANEL.ASSOCIATED});
  });
});

describe('closing an open panel by dragging it back', () => {
  test('dragging the associated panel toward its edge closes it past the fraction; less stays open', () => {
    const far = PANEL_W * (SWIPE.openFraction + 0.05);
    const near = PANEL_W * (SWIPE.openFraction - 0.15);
    const close = drag(steady(150, 150 + far, 900), {openPanel: PANEL.ASSOCIATED});
    expect(close.states[0].panel).toBe(PANEL.ASSOCIATED);
    expect(close.last.progress).toBeCloseTo(1 - far / PANEL_W, 1);
    expect(close.result.action).toBe('close');
    expect(drag(steady(150, 150 + near, 900), {openPanel: PANEL.ASSOCIATED}).result.action).toBe('stay');
  });

  test('a flick toward the edge closes it; dragging further in keeps it open', () => {
    expect(drag(steady(150, 210, 80), {openPanel: PANEL.ASSOCIATED}).result.action).toBe('close');
    const inward = drag(steady(250, 100, 200), {openPanel: PANEL.ASSOCIATED});
    expect(inward.last.progress).toBe(1);
    expect(inward.result.action).toBe('stay');
  });

  test('the config panel closes the other way, and both mirror in Hebrew', () => {
    expect(drag(steady(300, 120, 400), {openPanel: PANEL.CONFIG}).result.action).toBe('close');
    expect(drag(steady(300, 120, 400), {openPanel: PANEL.ASSOCIATED, dir: 'rtl'}).result.action).toBe('close');
    expect(drag(steady(100, 300, 400), {openPanel: PANEL.CONFIG, dir: 'rtl'}).result.action).toBe('close');
  });
});

test('settle animations: quick after a fling, proportionate after a slow drag, bounded', () => {
  expect(settleDuration(1, 1, 0, 300)).toBe(0);
  const slowShort = settleDuration(0.8, 1, 0, 300);
  const slowLong = settleDuration(0.1, 1, 0, 300);
  expect(slowLong).toBeGreaterThan(slowShort);
  expect(settleDuration(0.2, 1, 2, 300)).toBe(140);   // a hard fling: the floor
  expect(settleDuration(0, 1, 0.05, 3000)).toBe(320);  // never slower than the ceiling
});
