/**
 * Horizontal swipes that open and close the reader's two panels.
 *
 * Product rules: a swipe starts with a horizontal drag anywhere on the text, except in a
 * reserved zone at both screen edges (the iOS / Android back gestures live there). It is the
 * reader's only horizontal gesture. Directions follow the INTERFACE language: in an English
 * interface the trailing side is the right, so a drag from right to left pulls the associated
 * texts in from the right, and a drag from left to right pulls the config panel in from the
 * left. A Hebrew interface mirrors both.
 *
 * The gesture model, as native apps do it:
 *
 *   1. Intent. A touch commits to nothing until the finger has moved `slop` px. Then it is
 *      classified once, favoring vertical: horizontal only if |dx| > axisRatio * |dy|
 *      (within ~34 degrees of horizontal). Anything else is a scroll.
 *   2. Vertical intent releases the touch to the browser for good: native scrolling, and no
 *      more work from us for the rest of the gesture.
 *   3. Horizontal intent LOCKS: every later touchmove of the gesture is preventDefault()ed, so
 *      the page cannot scroll, and the panel follows dx alone (dy is ignored). The axis never
 *      switches back.
 *   4. Release settles by velocity (a flick) or by distance, with a curve whose initial slope
 *      matches the finger's speed, so the panel doesn't jump or stall as it lets go.
 *
 * Why touch events and not pointer events: preventDefault() on a pointermove does not stop
 * scrolling, and the browser fires pointercancel (ending the pointer stream) the moment it
 * starts to scroll. Only a cancelable touchmove can hold the page still. So the listener for
 * touchmove is non-passive; it does nothing but return until a gesture is locked horizontal, so
 * vertical scrolling pays one cheap function call per move. The browser makes a touchmove
 * uncancelable once it has begun scrolling, which is why `slop` sits at the low end (8px):
 * Chrome Android and iOS Safari both start scrolling at about that travel, and the event that
 * crosses it reaches us, blocking, before either does. If the locking touchmove is already
 * uncancelable anyway, the page is scrolling and we step aside (vertical).
 *
 * CSS keeps `touch-action: pan-y pinch-zoom` on the text and the panels: the browser never
 * pans horizontally or starts a history swipe there, and Chrome drops the scroll of a gesture
 * that starts horizontally. `touch-action` is read once, at touchstart, so it cannot be flipped
 * mid-gesture; `none` would kill native scrolling. iOS Safari honors pan-y but still scrolls
 * the vertical part of a diagonal drag, which is exactly what the lock above prevents.
 *
 * Also: a second finger cancels (a pinch); touchcancel settles back; a touch that lands while
 * the page is still moving (momentum after a fling) only stops the scroll, as in native apps;
 * a drag that starts after a long press, or over a text selection, is the reader selecting
 * text, not a swipe; taps never move past the slop, so they are never locked or prevented.
 *
 * `createSwipeTracker` is the pure state machine (tested without a DOM). `attachPanelSwipes`
 * feeds it touch events and holds the lock; `usePanelSwipes` is its React wrapper. The overlay
 * slot moves the panel.
 */
import {useEffect, useRef} from 'react';

export const SWIPE = {
  edgeZone: 24,         // px reserved at each screen edge for the OS back gesture
  slop: 8,              // px of travel before a touch is classified (and possibly locked)
  axisRatio: 1.5,       // horizontal only if |dx| > |dy| * axisRatio (about 34 degrees)
  commitDistance: 56,   // px of horizontal travel for a completed (non-interactive) swipe
  openFraction: 0.35,   // a slow drag commits once the panel is this far in (or out)
  flingVelocity: 0.35,  // px/ms: a release at least this fast settles in its direction
  flingMinTravel: 24,   // px: ...provided the finger travelled at least this far
  longPressMs: 450,     // a drag that starts this late is a text selection, not a swipe
  momentumMs: 120,      // a touch this soon after a scroll event lands on a moving page...
  momentumAfterMs: 5000, // ...if that scroll came within this long after a finger lifted (a fling)
  velocityWindowMs: 90, // velocity is measured over the last part of the drag
  rubberBand: 72,       // px: the most the panel stretches past fully open (asymptote)
};

export const PANEL = {ASSOCIATED: 'associated', CONFIG: 'config'};

export function startsInEdgeZone(x, viewportWidth, options = SWIPE) {
  return x < options.edgeZone || x > viewportWidth - options.edgeZone;
}

/**
 * @returns 'pending' (not enough travel yet), 'vertical' (let the page scroll),
 *          'horizontal' (lock: a swipe), or 'ignored' (started in an edge zone).
 */
export function classifyDrag(start, point, viewportWidth, options = SWIPE) {
  if (startsInEdgeZone(start.x, viewportWidth, options)) { return 'ignored'; }
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (Math.hypot(dx, dy) < options.slop) { return 'pending'; }
  return Math.abs(dx) > Math.abs(dy) * options.axisRatio ? 'horizontal' : 'vertical';
}

/** 'toTrailing' / 'toLeading' for a horizontal drag of `dx` px under `dir`, or null if too short. */
export function swipeDirection(dx, dir, options = SWIPE) {
  if (Math.abs(dx) < options.commitDistance) { return null; }
  return logicalDirection(dx, dir);
}

function logicalDirection(dx, dir) {
  const rightward = dx > 0;
  return (dir === 'rtl' ? !rightward : rightward) ? 'toTrailing' : 'toLeading';
}

/**
 * The panel a horizontal drag opens. From the trailing side toward the leading side: the
 * associated texts. The other way: the config panel.
 */
export function panelForDrag(dx, dir) {
  return logicalDirection(dx, dir) === 'toLeading' ? PANEL.ASSOCIATED : PANEL.CONFIG;
}

/** The physical side a panel is anchored to: associated on the trailing side, config on the leading side. */
export function panelSide(panel, dir) {
  const trailing = dir === 'rtl' ? 'left' : 'right';
  const leading = dir === 'rtl' ? 'right' : 'left';
  return panel === PANEL.ASSOCIATED ? trailing : leading;
}

/** +1 if pulling the panel in moves the finger rightward (a panel on the left), else -1. */
export function openingSign(panel, dir) {
  return panelSide(panel, dir) === 'left' ? 1 : -1;
}

/** translateX (px) for a panel at `progress` (0 closed, 1 open, >1 stretched past open) of `width` px. */
export function panelOffset(panel, dir, progress, width) {
  return -openingSign(panel, dir) * (1 - progress) * width;
}

/**
 * Resistance past a limit, as iOS scroll views do it: `over` px of finger travel moves the
 * panel f(over) px, which starts 1:1-ish and flattens toward `limit`.
 */
export function rubberBand(over, limit = SWIPE.rubberBand) {
  if (over <= 0 || limit <= 0) { return 0; }
  return limit * (1 - 1 / ((over * 0.55) / limit + 1));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The settle animation from progress `from` to `to` after a release at `velocity` px/ms
 * (signed, in the panel's opening direction), for a panel `width` px wide.
 *
 * Returns {duration (ms), easing (CSS timing function)}. The curve decelerates to a soft stop
 * (a critically damped spring's shape), and its initial slope matches the finger: a flick
 * hands its speed to the panel instead of the panel jumping ahead or stalling. A release from
 * rest gets a proportionate, gentle ease-out.
 */
export function settleCurve(from, to, velocity, width) {
  const distance = Math.abs(to - from) * Math.max(width, 1);
  if (distance < 0.5) { return {duration: 0, easing: 'linear'}; }
  const toward = Math.sign(to - from) * Math.sign(velocity) > 0 ? Math.abs(velocity) : 0;  // px/ms toward the target
  const x1 = 0.3;
  let duration;
  let slope;  // initial slope of the curve (1 = linear)
  if (toward >= 0.1) {
    duration = clamp((2 * distance) / toward, 160, 420);
    slope = clamp((toward * duration) / distance, 1, 3.2);
  } else {
    duration = clamp(200 + 180 * (distance / Math.max(width, 1)), 200, 380);
    slope = 2.2;
  }
  duration = Math.round(duration);
  const y1 = Math.round(slope * x1 * 1000) / 1000;
  return {duration, easing: `cubic-bezier(${x1}, ${y1}, 0.25, 1)`};
}

/** Just the duration of `settleCurve` (kept for callers that animate with their own curve). */
export function settleDuration(from, to, velocity, width) {
  return settleCurve(from, to, velocity, width).duration;
}

/**
 * One drag, from touch start to touch end.
 *
 *   const t = createSwipeTracker({dir, viewportWidth, panelWidth, openPanel});
 *   t.start({x, y, t}, {lastScrollAt}) -> false if the drag can never become a swipe
 *   t.move({x, y, t})                  -> {phase, panel, progress}
 *   t.end({x, y, t}) / t.cancel()      -> {action, panel, progress, velocity}
 *   t.locked                           -> true once the drag is locked horizontal
 *
 * `openPanel` is null when no panel is open (the drag may open one) or the open panel's name
 * (the drag may close it). `panelWidth(panel)` is the panel's width in px. `lastScrollAt` is the
 * timeStamp of the latest scroll event: a touch that lands on a still-moving page is ignored.
 * Phases: 'idle', 'pending', 'dragging' (locked horizontal), 'vertical', 'ignored'. Once a
 * phase other than 'pending' is reached, it holds until the gesture ends: no axis switching.
 * Actions: 'open', 'cancel' (closed mode), 'close', 'stay' (open mode), 'none' (never a swipe).
 */
export function createSwipeTracker({dir = 'ltr', viewportWidth, panelWidth, openPanel = null, options = SWIPE}) {
  let origin = null;
  let phase = 'idle';
  let panel = openPanel;
  let progress = openPanel ? 1 : 0;
  let samples = [];
  const widthOf = (p) => Math.max(1, (panelWidth && panelWidth(p)) || viewportWidth || 1);

  const progressAt = (x) => {
    const width = widthOf(panel);
    const travel = (x - origin.x) * openingSign(panel, dir);
    const raw = (openPanel ? 1 : 0) + travel / width;
    if (raw <= 0) { return 0; }
    if (raw <= 1) { return raw; }
    return 1 + rubberBand((raw - 1) * width, options.rubberBand) / width;  // stretch past open
  };

  const velocity = () => {
    // px/ms in the panel's opening direction, over the last velocityWindowMs of the drag.
    if (samples.length < 2 || !panel) { return 0; }
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (let i = samples.length - 2; i >= 0; i--) {
      first = samples[i];
      if (last.t - samples[i].t >= options.velocityWindowMs) { break; }
    }
    const dt = last.t - first.t;
    return dt > 0 ? ((last.x - first.x) / dt) * openingSign(panel, dir) : 0;
  };

  const state = () => ({phase, panel, progress});
  const none = () => ({action: 'none', panel: null, progress, velocity: 0});

  return {
    start(point, {lastScrollAt = -Infinity} = {}) {
      origin = point;
      samples = [point];
      if (startsInEdgeZone(point.x, viewportWidth, options)) { phase = 'ignored'; return false; }
      if (point.t - lastScrollAt < options.momentumMs) { phase = 'ignored'; return false; }  // stopping a fling
      phase = 'pending';
      return true;
    },
    move(point) {
      if (!origin || phase === 'ignored' || phase === 'vertical' || phase === 'idle') { return state(); }
      samples.push(point);
      if (samples.length > 12) { samples.shift(); }
      if (phase === 'pending') {
        const kind = classifyDrag(origin, point, viewportWidth, options);
        if (kind === 'pending') { return state(); }
        if (kind !== 'horizontal') { phase = kind; return state(); }
        if (point.t - origin.t > options.longPressMs) { phase = 'ignored'; return state(); }
        if (!openPanel) { panel = panelForDrag(point.x - origin.x, dir); }
        phase = 'dragging';
      }
      progress = progressAt(point.x);  // dx only: once locked, dy never matters
      return state();
    },
    /** Give the gesture back to the browser (it could not be locked after all). */
    release() {
      if (phase === 'pending' || phase === 'dragging') { phase = 'vertical'; }
    },
    end(point) {
      if (point && phase === 'dragging') { this.move(point); }
      if (phase !== 'dragging') { phase = 'idle'; return none(); }
      const v = velocity();
      const travel = Math.abs(samples[samples.length - 1].x - origin.x);
      const fling = travel >= options.flingMinTravel && Math.abs(v) >= options.flingVelocity;
      let action;
      if (openPanel) {
        const closing = fling ? v < 0 : progress <= 1 - options.openFraction;
        action = closing ? 'close' : 'stay';
      } else {
        const opening = fling ? v > 0 : progress >= options.openFraction;
        action = opening ? 'open' : 'cancel';
      }
      phase = 'idle';
      return {action, panel, progress, velocity: v};
    },
    cancel() {
      const wasDragging = phase === 'dragging';
      phase = 'idle';
      if (!wasDragging) { return none(); }
      return {action: openPanel ? 'stay' : 'cancel', panel, progress, velocity: 0};
    },
    get phase() { return phase; },
    get locked() { return phase === 'dragging'; },
  };
}

/** Drags that must stay with the browser: form fields, editable text, anything marked no-swipe. */
function isExcludedTarget(target) {
  return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], [data-ng-noswipe]'));
}

function hasSelection() {
  const selection = typeof window !== 'undefined' && window.getSelection && window.getSelection();
  return !!(selection && !selection.isCollapsed && String(selection).length);
}

/**
 * Feed the touch events on `root` (normally the document) into swipe trackers, and hold the
 * page still while a swipe is locked. Returns a function that detaches everything.
 *
 * @param dir         the interface direction, 'ltr' | 'rtl'
 * @param getOpen     () => the open panel's name, or null
 * @param canStart    (target, openPanel) => whether a drag starting on `target` may swipe
 * @param panelWidth  (panel) => its width in px
 * @param onStart     (panel, openPanel) => void, once a drag locks horizontal
 * @param onMove      (panel, progress) => void, coalesced to one call per animation frame
 * @param onEnd       ({action, panel, progress, velocity}) => void
 */
export function attachPanelSwipes(root, {dir, getOpen, canStart, panelWidth, onStart, onMove, onEnd}) {
  const win = (root.defaultView || root.ownerDocument && root.ownerDocument.defaultView || window);
  const raf = (fn) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : setTimeout(fn, 16));
  const caf = (id) => (win.cancelAnimationFrame ? win.cancelAnimationFrame(id) : clearTimeout(id));
  let tracker = null;
  let touchId = null;
  let blocked = false;   // a second finger landed: nothing until every finger lifts
  let lastScrollAt = -Infinity;   // the latest scroll that looked like momentum (after a lift)
  let lastLiftAt = -Infinity;     // the latest time every finger was off the screen
  let fingers = 0;
  let frame = null;
  let pending = null;

  const now = (e) => (e && typeof e.timeStamp === 'number' ? e.timeStamp : Date.now());
  const find = (list, id) => {
    for (let i = 0; list && i < list.length; i++) { if (list[i].identifier === id) { return list[i]; } }
    return null;
  };
  const point = (touch, e) => ({x: touch.clientX, y: touch.clientY, t: now(e)});
  const flush = () => {
    frame = null;
    if (pending) { const p = pending; pending = null; onMove(p.panel, p.progress); }
  };
  const finish = (result) => {
    if (frame !== null) { caf(frame); frame = null; }
    if (pending) { flush(); }
    tracker = null;
    touchId = null;
    if (result && result.action !== 'none') { onEnd(result); }
  };

  // Momentum: the page (or a panel's list) still scrolling after the finger lifted. Scrolls
  // under a finger, or with no touch before them (code, a keyboard), don't count.
  const onScroll = (e) => {
    const t = now(e);
    if (!fingers && t - lastLiftAt < SWIPE.momentumAfterMs) { lastScrollAt = t; }
  };

  const onTouchStart = (e) => {
    const touches = e.touches || [];
    fingers = touches.length || 1;
    if (touches.length > 1 || blocked) {  // a second finger: a pinch, not a swipe
      blocked = true;
      if (tracker) { finish(tracker.cancel()); }
      return;
    }
    if (tracker) { finish(tracker.cancel()); }  // a lost touchend: start clean
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) { return; }
    const open = getOpen();
    if (isExcludedTarget(e.target) || hasSelection() || !canStart(e.target, open)) { return; }
    const t = createSwipeTracker({dir, viewportWidth: win.innerWidth, openPanel: open, panelWidth});
    if (!t.start(point(touch, e), {lastScrollAt})) { return; }
    tracker = t;
    touchId = touch.identifier;
  };

  const onTouchMove = (e) => {
    if (!tracker) { return; }  // the common case while scrolling: nothing to do
    if (e.touches && e.touches.length > 1) { blocked = true; finish(tracker.cancel()); return; }
    const touch = find(e.changedTouches, touchId) || find(e.touches, touchId);
    if (!touch) { return; }
    const wasLocked = tracker.locked;
    const {phase, panel, progress} = tracker.move(point(touch, e));
    if (phase === 'vertical' || phase === 'ignored') { tracker = null; touchId = null; return; }  // native scroll owns it
    if (phase !== 'dragging') { return; }
    if (!wasLocked) {
      // The lock. If the browser already scrolls (the event can't be cancelled) or the reader
      // is selecting text, step aside for the rest of the gesture.
      if (e.cancelable === false || hasSelection()) { tracker.release(); tracker = null; touchId = null; return; }
      e.preventDefault();
      onStart(panel, getOpen());
    } else if (e.cancelable !== false) {
      e.preventDefault();  // every move of a locked gesture: browsers resume scrolling otherwise
    }
    pending = {panel, progress};
    if (frame === null) { frame = raf(flush); }
  };

  const onTouchEnd = (e) => {
    const remaining = e.touches ? e.touches.length : 0;
    fingers = remaining;
    if (!remaining) { blocked = false; lastLiftAt = now(e); }
    if (!tracker) { return; }
    const touch = find(e.changedTouches, touchId);
    if (!touch) { return; }
    finish(tracker.end(point(touch, e)));
  };

  const onTouchCancel = (e) => {
    fingers = e.touches ? e.touches.length : 0;
    if (!fingers) { blocked = false; lastLiftAt = now(e); }
    if (tracker) { finish(tracker.cancel()); }
  };

  root.addEventListener('touchstart', onTouchStart, {passive: true});
  root.addEventListener('touchmove', onTouchMove, {passive: false});  // the lock needs preventDefault
  root.addEventListener('touchend', onTouchEnd, {passive: true});
  root.addEventListener('touchcancel', onTouchCancel, {passive: true});
  root.addEventListener('scroll', onScroll, {passive: true, capture: true});  // the page or a panel list
  return () => {
    root.removeEventListener('touchstart', onTouchStart, {passive: true});
    root.removeEventListener('touchmove', onTouchMove, {passive: false});
    root.removeEventListener('touchend', onTouchEnd, {passive: true});
    root.removeEventListener('touchcancel', onTouchCancel, {passive: true});
    root.removeEventListener('scroll', onScroll, {passive: true, capture: true});
    if (frame !== null) { caf(frame); }
  };
}

/** React wrapper: attaches `attachPanelSwipes` to the document while mounted and enabled. */
export function usePanelSwipes({dir, getOpen, canStart, panelWidth, onStart, onMove, onEnd, enabled = true}) {
  const handlers = useRef({});
  handlers.current = {getOpen, canStart, panelWidth, onStart, onMove, onEnd};
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') { return undefined; }
    return attachPanelSwipes(document, {
      dir,
      getOpen: () => handlers.current.getOpen(),
      canStart: (target, open) => handlers.current.canStart(target, open),
      panelWidth: (p) => handlers.current.panelWidth(p),
      onStart: (p, open) => handlers.current.onStart(p, open),
      onMove: (p, progress) => handlers.current.onMove(p, progress),
      onEnd: (result) => handlers.current.onEnd(result),
    });
  }, [dir, enabled]);
}
