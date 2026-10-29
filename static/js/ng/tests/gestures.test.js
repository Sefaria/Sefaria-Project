import {
  attachPanelSwipes, classifyDrag, createSwipeTracker, openingSign, PANEL, panelForDrag, panelOffset, panelSide,
  rubberBand, settleCurve, settleDuration, startsInEdgeZone, swipeDirection, SWIPE,
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
    expect(SWIPE.slop).toBeGreaterThanOrEqual(8);
    expect(SWIPE.slop).toBeLessThanOrEqual(12);
    expect(classifyDrag({x: 200, y: 300}, {x: 204, y: 302}, W)).toBe('pending');
    expect(classifyDrag({x: 200, y: 300}, {x: 200 - SWIPE.slop + 1, y: 300}, W)).toBe('pending');
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
    expect(inward.last.progress).toBeGreaterThan(1);  // stretched past open, with resistance
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
  expect(settleDuration(0.2, 1, 3, 300)).toBe(160);    // a hard fling: the floor
  expect(settleDuration(0, 1, 0.05, 3000)).toBeLessThanOrEqual(420);  // never slower than the ceiling
  expect(settleDuration(0.2, 1, 0.5, 300)).toBeLessThan(settleDuration(0.2, 1, 0, 300) + 200);
});

describe('physics: rubber band past open, and a settle that picks up the finger', () => {
  test('rubberBand resists more the further it goes, and never passes its limit', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-10)).toBe(0);
    const a = rubberBand(20);
    const b = rubberBand(40);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(20);
    expect(b - a).toBeLessThan(a);           // diminishing returns
    expect(rubberBand(10000)).toBeLessThan(SWIPE.rubberBand);
  });

  test('while opening, the panel tracks the finger 1:1, then stretches with resistance past open', () => {
    const {states} = drag([[360, 400, 0], [350, 400, 16], [360 - PANEL_W, 400, 200], [360 - PANEL_W - 100, 400, 300]], {dir: 'ltr'});
    // (the start is inside the viewport: W - edgeZone = 366)
    expect(states[1].progress).toBeCloseTo(1, 5);
    const stretched = states[2].progress;
    expect(stretched).toBeGreaterThan(1);
    expect((stretched - 1) * PANEL_W).toBeLessThan(100 * 0.6);  // well under the finger's 100px
  });

  test('the settle curve decelerates to a stop and starts at the release speed', () => {
    const rest = settleCurve(0.5, 1, 0, 300);
    expect(rest.easing).toMatch(/^cubic-bezier\(0\.3, [\d.]+, 0\.25, 1\)$/);
    const slope = (easing) => { const [x1, y1] = easing.match(/[\d.]+/g).map(Number); return y1 / x1; };
    // initial speed (px/ms) = slope * distance / duration: matches a moderate flick
    const flick = settleCurve(0.5, 1, 0.9, 300);
    expect(slope(flick.easing) * 150 / flick.duration).toBeCloseTo(0.9, 1);
    // velocity away from the target is ignored (the release rule decided the direction)
    expect(settleCurve(0.5, 1, -0.9, 300)).toEqual(rest);
    expect(settleCurve(1, 1, 1, 300).duration).toBe(0);
  });
});

describe('intent detection and the axis lock', () => {
  test('a mostly horizontal drag with vertical wobble locks horizontal and ignores dy afterward', () => {
    // 12px sideways, 4px down at the lock (18 degrees), then the finger wanders up and down.
    const {states, result} = drag([[300, 400, 0], [288, 404, 16], [250, 430, 60], [200, 370, 120], [150, 460, 180]]);
    expect(states.map(s => s.phase)).toEqual(['dragging', 'dragging', 'dragging', 'dragging']);
    const {states: flat} = drag([[300, 400, 0], [288, 400, 16], [250, 400, 60], [200, 400, 120], [150, 400, 180]]);
    expect(states.map(s => s.progress)).toEqual(flat.map(s => s.progress));  // dy never moves the panel
    expect(result.action).toBe('open');
  });

  test('angle classification favors vertical: ~34 degrees is the line', () => {
    const at = (deg) => {
      const r = (deg * Math.PI) / 180;
      return classifyDrag({x: 200, y: 300}, {x: 200 - 20 * Math.cos(r), y: 300 + 20 * Math.sin(r)}, W);
    };
    expect(at(0)).toBe('horizontal');
    expect(at(20)).toBe('horizontal');
    expect(at(30)).toBe('horizontal');
    expect(at(36)).toBe('vertical');
    expect(at(45)).toBe('vertical');   // a true diagonal scrolls
    expect(at(80)).toBe('vertical');
  });

  test('once locked horizontal, a turn to vertical never releases the lock', () => {
    const {states, result} = drag([[300, 400, 0], [288, 401, 16], [280, 460, 60], [279, 560, 120], [278, 700, 200]]);
    expect(states.every(s => s.phase === 'dragging')).toBe(true);
    expect(result.action).not.toBe('none');
  });

  test('once vertical, a turn to horizontal never becomes a swipe', () => {
    const {states, result} = drag([[200, 400, 0], [201, 390, 16], [120, 388, 60], [20, 388, 120]]);
    expect(states.map(s => s.phase)).toEqual(['vertical', 'vertical', 'vertical']);
    expect(result.action).toBe('none');
  });

  test('a touch that lands while the page is still scrolling (momentum) only stops it', () => {
    const tracker = createSwipeTracker({dir: 'ltr', viewportWidth: W, panelWidth: () => PANEL_W});
    expect(tracker.start({x: 300, y: 400, t: 1000}, {lastScrollAt: 1000 - SWIPE.momentumMs + 20})).toBe(false);
    expect(tracker.move({x: 150, y: 400, t: 1100}).phase).toBe('ignored');
    const settled = createSwipeTracker({dir: 'ltr', viewportWidth: W, panelWidth: () => PANEL_W});
    expect(settled.start({x: 300, y: 400, t: 1000}, {lastScrollAt: 1000 - SWIPE.momentumMs - 20})).toBe(true);
  });

  test('release() hands a drag back to the browser for good', () => {
    const tracker = createSwipeTracker({dir: 'ltr', viewportWidth: W, panelWidth: () => PANEL_W});
    tracker.start({x: 300, y: 400, t: 0});
    tracker.move({x: 280, y: 400, t: 16});
    tracker.release();
    expect(tracker.move({x: 200, y: 400, t: 40}).phase).toBe('vertical');
    expect(tracker.end({x: 200, y: 400, t: 60}).action).toBe('none');
  });
});

/**
 * The DOM binding, in jsdom: touch events on a document, and what the listener does with them.
 * The heart of the lock: preventDefault() on a touchmove only once the gesture is horizontal.
 */
describe('attachPanelSwipes: touch events, the lock, and preventDefault', () => {
  let root;
  let calls;
  let detach;
  let open;
  const frames = [];

  function fire(type, {x = 0, y = 0, t, id = 1, points, changed, cancelable = true, target} = {}) {
    const event = new Event(type, {bubbles: true, cancelable});
    const finger = (p) => ({identifier: p.id !== undefined ? p.id : id, clientX: p.x, clientY: p.y});
    const here = [finger({x, y, id})];
    const down = points ? points.map(finger) : (type === 'touchend' || type === 'touchcancel' ? [] : here);
    Object.defineProperty(event, 'touches', {value: down});
    Object.defineProperty(event, 'changedTouches', {value: changed ? changed.map(finger) : here});
    if (t !== undefined) { Object.defineProperty(event, 'timeStamp', {value: t}); }
    (target || root.querySelector('#text')).dispatchEvent(event);
    return event;
  }

  function mount({dir = 'ltr', openPanel = null} = {}) {
    open = openPanel;
    calls = {start: [], move: [], end: []};
    detach = attachPanelSwipes(document, {
      dir,
      getOpen: () => open,
      canStart: (target) => !!target.closest('#text'),
      panelWidth: () => PANEL_W,
      onStart: (panel, o) => calls.start.push([panel, o]),
      onMove: (panel, progress) => calls.move.push([panel, progress]),
      onEnd: (result) => calls.end.push(result),
    });
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="text"><span id="seg">In the beginning</span><input id="field"></div><div id="elsewhere"></div>';
    root = document.body;
    Object.defineProperty(window, 'innerWidth', {value: W, configurable: true});
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frames.push(fn); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });
  afterEach(() => {
    if (detach) { detach(); detach = null; }
    frames.length = 0;
    jest.restoreAllMocks();
  });
  const runFrames = () => { while (frames.length) { frames.shift()(); } };

  test('touches inside the slop are never prevented (taps and the start of every scroll stay native)', () => {
    mount();
    expect(fire('touchstart', {x: 300, y: 400, t: 0}).defaultPrevented).toBe(false);
    expect(fire('touchmove', {x: 297, y: 402, t: 16}).defaultPrevented).toBe(false);
    expect(fire('touchmove', {x: 295, y: 403, t: 32}).defaultPrevented).toBe(false);
    fire('touchend', {x: 295, y: 403, t: 60});
    expect(calls).toEqual({start: [], move: [], end: []});
  });

  test('a vertical drag is never prevented, even when it later turns sideways', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    const moves = [[298, 385], [290, 340], [200, 330], [100, 330]].map(([x, y], i) => fire('touchmove', {x, y, t: 16 * (i + 1)}));
    expect(moves.map(e => e.defaultPrevented)).toEqual([false, false, false, false]);
    fire('touchend', {x: 100, y: 330, t: 100});
    expect(calls.start).toEqual([]);
    expect(calls.end).toEqual([]);
  });

  test('a horizontal drag with wobble: prevented from the locking move on, every move, dx only', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    const first = fire('touchmove', {x: 296, y: 401, t: 8});   // inside the slop
    const lock = fire('touchmove', {x: 288, y: 404, t: 16});   // 12px, 18 degrees: lock
    const wobble = [[260, 430], [220, 380], [170, 450], [120, 420]].map(([x, y], i) => fire('touchmove', {x, y, t: 32 + 16 * i}));
    expect(first.defaultPrevented).toBe(false);
    expect(lock.defaultPrevented).toBe(true);
    expect(wobble.every(e => e.defaultPrevented)).toBe(true);
    expect(calls.start).toEqual([[PANEL.ASSOCIATED, null]]);
    runFrames();
    expect(calls.move).toHaveLength(1);  // coalesced to one per frame
    expect(calls.move[0][1]).toBeCloseTo((300 - 120) / PANEL_W, 5);
    const end = fire('touchend', {x: 120, y: 420, t: 100});
    expect(end.defaultPrevented).toBe(false);
    expect(calls.end).toHaveLength(1);
    expect(calls.end[0]).toMatchObject({action: 'open', panel: PANEL.ASSOCIATED});
  });

  test('if the browser is already scrolling (the locking move is uncancelable), step aside', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    fire('touchmove', {x: 288, y: 402, t: 16, cancelable: false});
    const later = fire('touchmove', {x: 200, y: 402, t: 40});
    expect(later.defaultPrevented).toBe(false);
    fire('touchend', {x: 200, y: 402, t: 60});
    expect(calls.start).toEqual([]);
    expect(calls.end).toEqual([]);
  });

  test('a second finger cancels the swipe (it settles back), and nothing starts until all fingers lift', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    fire('touchmove', {x: 280, y: 400, t: 16});
    fire('touchmove', {x: 200, y: 400, t: 60});
    fire('touchstart', {x: 100, y: 300, id: 2, t: 70, points: [{x: 200, y: 400, id: 1}, {x: 100, y: 300, id: 2}], changed: [{x: 100, y: 300, id: 2}]});
    expect(calls.end).toEqual([expect.objectContaining({action: 'cancel', panel: PANEL.ASSOCIATED})]);
    // the pinch continues: nothing is prevented, nothing new starts
    const pinch = fire('touchmove', {x: 150, y: 400, t: 90, points: [{x: 150, y: 400, id: 1}, {x: 60, y: 300, id: 2}]});
    expect(pinch.defaultPrevented).toBe(false);
    fire('touchend', {x: 60, y: 300, id: 2, t: 100, points: [{x: 150, y: 400, id: 1}], changed: [{x: 60, y: 300, id: 2}]});
    const oneLeft = fire('touchmove', {x: 50, y: 400, t: 120, points: [{x: 50, y: 400, id: 1}]});
    expect(oneLeft.defaultPrevented).toBe(false);
    fire('touchend', {x: 50, y: 400, t: 130});
    expect(calls.start).toHaveLength(1);
    expect(calls.end).toHaveLength(1);
    // after every finger lifted, a new swipe works again
    fire('touchstart', {x: 300, y: 400, t: 400});
    expect(fire('touchmove', {x: 280, y: 400, t: 416}).defaultPrevented).toBe(true);
  });

  test('touchcancel settles a locked swipe back', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    fire('touchmove', {x: 280, y: 400, t: 16});
    fire('touchmove', {x: 150, y: 400, t: 60});
    fire('touchcancel', {x: 150, y: 400, t: 70});
    expect(calls.end).toEqual([expect.objectContaining({action: 'cancel', panel: PANEL.ASSOCIATED, velocity: 0})]);
  });

  test('a touch that lands during momentum scrolling never locks', () => {
    mount();
    const scroll = (t) => document.dispatchEvent(Object.defineProperty(new Event('scroll'), 'timeStamp', {value: t}));
    // A scroll with no touch before it (code, a keyboard) is not momentum.
    scroll(100);
    fire('touchstart', {x: 300, y: 400, t: 150});
    expect(fire('touchmove', {x: 280, y: 400, t: 166}).defaultPrevented).toBe(true);
    fire('touchend', {x: 280, y: 400, t: 300});
    calls.end.length = 0;
    calls.start.length = 0;
    // A vertical fling: the finger lifts at 600 and the page keeps scrolling on its own.
    fire('touchstart', {x: 200, y: 600, t: 500});
    fire('touchmove', {x: 202, y: 500, t: 550});
    fire('touchend', {x: 202, y: 300, t: 600});
    [700, 800, 900, 950].forEach(scroll);
    fire('touchstart', {x: 300, y: 400, t: 1000});
    expect(fire('touchmove', {x: 280, y: 400, t: 1016}).defaultPrevented).toBe(false);
    fire('touchend', {x: 150, y: 400, t: 1100});
    expect(calls.start).toEqual([]);
    // once the page has come to rest, it works
    fire('touchstart', {x: 300, y: 400, t: 2000});
    expect(fire('touchmove', {x: 280, y: 400, t: 2016}).defaultPrevented).toBe(true);
  });

  test('edge zones, form fields, other targets and a text selection are left alone', () => {
    mount();
    for (const x of [4, W - 4]) {
      fire('touchstart', {x, y: 400, t: 0});
      expect(fire('touchmove', {x: x < W / 2 ? x + 30 : x - 30, y: 400, t: 16}).defaultPrevented).toBe(false);
      fire('touchend', {x, y: 400, t: 30});
    }
    for (const target of [document.getElementById('field'), document.getElementById('elsewhere')]) {
      fire('touchstart', {x: 300, y: 400, t: 100, target});
      expect(fire('touchmove', {x: 270, y: 400, t: 116, target}).defaultPrevented).toBe(false);
      fire('touchend', {x: 270, y: 400, t: 130, target});
    }
    const had = window.getSelection;
    window.getSelection = () => ({isCollapsed: false, toString: () => 'In the beginning'});
    fire('touchstart', {x: 300, y: 400, t: 200});
    expect(fire('touchmove', {x: 270, y: 400, t: 216}).defaultPrevented).toBe(false);
    fire('touchend', {x: 270, y: 400, t: 230});
    window.getSelection = had;
    // a long press, then a drag: selecting text
    fire('touchstart', {x: 300, y: 400, t: 1000});
    expect(fire('touchmove', {x: 270, y: 400, t: 1000 + SWIPE.longPressMs + 40}).defaultPrevented).toBe(false);
    fire('touchend', {x: 270, y: 400, t: 1000 + SWIPE.longPressMs + 60});
    expect(calls).toEqual({start: [], move: [], end: []});
  });

  test('Hebrew interface: left-to-right opens associated texts; an open panel drags closed the mirrored way', () => {
    mount({dir: 'rtl'});
    fire('touchstart', {x: 100, y: 400, t: 0});
    expect(fire('touchmove', {x: 112, y: 403, t: 16}).defaultPrevented).toBe(true);
    fire('touchmove', {x: 300, y: 410, t: 120});
    fire('touchend', {x: 300, y: 410, t: 140});
    expect(calls.start).toEqual([[PANEL.ASSOCIATED, null]]);
    expect(calls.end[0]).toMatchObject({action: 'open', panel: PANEL.ASSOCIATED});
    detach();
    mount({dir: 'rtl', openPanel: PANEL.ASSOCIATED});
    fire('touchstart', {x: 250, y: 400, t: 1000});
    expect(fire('touchmove', {x: 238, y: 401, t: 1016}).defaultPrevented).toBe(true);
    fire('touchmove', {x: 60, y: 404, t: 1200});
    fire('touchend', {x: 60, y: 404, t: 1240});
    expect(calls.end[0]).toMatchObject({action: 'close', panel: PANEL.ASSOCIATED});
  });

  test('flick vs distance through the binding: a short fast flick opens, a short slow drag does not', () => {
    mount();
    fire('touchstart', {x: 300, y: 400, t: 0});
    [[285, 16], [265, 32], [245, 48], [230, 64]].forEach(([x, t]) => fire('touchmove', {x, y: 400, t}));
    fire('touchend', {x: 230, y: 400, t: 70});
    expect(calls.end[0]).toMatchObject({action: 'open'});
    fire('touchstart', {x: 300, y: 400, t: 1000});
    [[288, 1100], [270, 1300], [240, 1600]].forEach(([x, t]) => fire('touchmove', {x, y: 400, t}));
    fire('touchend', {x: 240, y: 400, t: 1800});
    expect(calls.end[1]).toMatchObject({action: 'cancel'});
  });

  test('detaching removes every listener', () => {
    mount();
    detach();
    detach = null;
    fire('touchstart', {x: 300, y: 400, t: 0});
    expect(fire('touchmove', {x: 280, y: 400, t: 16}).defaultPrevented).toBe(false);
  });
});
