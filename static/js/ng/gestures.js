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
 * The panel follows the finger and settles by distance or by velocity. Vertical scrolling wins
 * any drag that is not clearly horizontal, and a drag never starts over a text selection or
 * after a long press (that is the user selecting text).
 *
 * `createSwipeTracker` is the pure state machine (tested without a DOM). `usePanelSwipes` feeds
 * it pointer events from the document; the overlay slot moves the panel.
 */
import {useEffect, useRef} from 'react';

export const SWIPE = {
  edgeZone: 24,         // px reserved at each screen edge for the OS back gesture
  lockDistance: 10,     // px of travel before the drag is locked to an axis
  axisRatio: 1.5,       // |dx| must exceed |dy| * axisRatio to lock horizontal
  commitDistance: 56,   // px of horizontal travel for a completed (non-interactive) swipe
  openFraction: 0.35,   // a slow drag commits once the panel is this far in (or out)
  flingVelocity: 0.35,  // px/ms: a release at least this fast settles in its direction
  flingMinTravel: 24,   // px: ...provided the finger travelled at least this far
  longPressMs: 450,     // a drag that starts this late is a text selection, not a swipe
  velocityWindowMs: 90, // velocity is measured over the last part of the drag
};

export const PANEL = {ASSOCIATED: 'associated', CONFIG: 'config'};

export function startsInEdgeZone(x, viewportWidth, options = SWIPE) {
  return x < options.edgeZone || x > viewportWidth - options.edgeZone;
}

/**
 * @returns 'pending' (not enough travel yet), 'vertical' (let the page scroll),
 *          'horizontal' (a swipe in progress), or 'ignored' (started in an edge zone).
 */
export function classifyDrag(start, point, viewportWidth, options = SWIPE) {
  if (startsInEdgeZone(start.x, viewportWidth, options)) { return 'ignored'; }
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (Math.hypot(dx, dy) < options.lockDistance) { return 'pending'; }
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

/** translateX (px) for a panel at `progress` (0 closed, 1 open) of `width` px. */
export function panelOffset(panel, dir, progress, width) {
  return -openingSign(panel, dir) * (1 - progress) * width;
}

/** How long a settle animation takes: quick after a fling, proportionate after a slow drag. */
export function settleDuration(from, to, velocity, width) {
  const distance = Math.abs(to - from) * width;
  if (!distance) { return 0; }
  const speed = Math.abs(velocity);
  const ms = speed >= 0.3 ? distance / speed : 180 + 140 * (distance / Math.max(width, 1));
  return Math.round(Math.min(320, Math.max(140, ms)));
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * One drag, from pointer down to pointer up.
 *
 *   const t = createSwipeTracker({dir, viewportWidth, panelWidth, openPanel});
 *   t.start({x, y, t})            -> false if the drag can never become a swipe
 *   t.move({x, y, t})             -> {phase, panel, progress}
 *   t.end({x, y, t}) / t.cancel() -> {action, panel, progress, velocity}
 *
 * `openPanel` is null when no panel is open (the drag may open one) or the open panel's name
 * (the drag may close it). `panelWidth(panel)` is the panel's width in px.
 * Phases: 'pending', 'dragging', 'vertical', 'ignored'. Actions: 'open', 'cancel' (closed
 * mode), 'close', 'stay' (open mode), 'none' (the drag never became a swipe).
 */
export function createSwipeTracker({dir = 'ltr', viewportWidth, panelWidth, openPanel = null, options = SWIPE}) {
  let origin = null;
  let phase = 'idle';
  let panel = openPanel;
  let progress = openPanel ? 1 : 0;
  let samples = [];
  const widthOf = (p) => Math.max(1, (panelWidth && panelWidth(p)) || viewportWidth || 1);

  const progressAt = (x) => {
    const travel = (x - origin.x) * openingSign(panel, dir);
    return clamp01((openPanel ? 1 : 0) + travel / widthOf(panel));
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

  return {
    start(point) {
      origin = point;
      samples = [point];
      if (startsInEdgeZone(point.x, viewportWidth, options)) { phase = 'ignored'; return false; }
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
      progress = progressAt(point.x);
      return state();
    },
    end(point) {
      if (point && phase === 'dragging') { this.move(point); }
      if (phase !== 'dragging') { phase = 'idle'; return {action: 'none', panel: null, progress, velocity: 0}; }
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
      if (!wasDragging) { return {action: 'none', panel: null, progress, velocity: 0}; }
      return {action: openPanel ? 'stay' : 'cancel', panel, progress, velocity: 0};
    },
    get phase() { return phase; },
  };
}

/** Drags that must stay with the browser: form fields, editable text, anything marked no-swipe. */
function isExcludedTarget(target) {
  return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"], [data-ng-noswipe]'));
}

function hasSelection() {
  const selection = window.getSelection && window.getSelection();
  return !!(selection && !selection.isCollapsed && String(selection).length);
}

/**
 * Feed touch (and pen) pointer events on the document into swipe trackers.
 *
 * @param dir         the interface direction, 'ltr' | 'rtl'
 * @param getOpen     () => the open panel's name, or null
 * @param canStart    (target, openPanel) => whether a drag starting on `target` may swipe
 * @param panelWidth  (panel) => its width in px
 * @param onStart     (panel, openPanel) => void, once a drag locks horizontal
 * @param onMove      (panel, progress) => void, coalesced to one call per animation frame
 * @param onEnd       ({action, panel, progress, velocity}) => void
 *
 * Mouse drags are left alone (they select text on a desktop). The stream and the panels set
 * `touch-action: pan-y`, so the browser keeps vertical scrolling and hands horizontal drags to
 * us; a drag the browser takes over (pointercancel) settles back.
 */
export function usePanelSwipes({dir, getOpen, canStart, panelWidth, onStart, onMove, onEnd, enabled = true}) {
  const handlers = useRef({});
  handlers.current = {getOpen, canStart, panelWidth, onStart, onMove, onEnd};
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') { return undefined; }
    let tracker = null;
    let pointerId = null;
    let active = 0;
    let frame = null;
    let pending = null;
    const now = (e) => (e && e.timeStamp) || Date.now();
    const point = (e) => ({x: e.clientX, y: e.clientY, t: now(e)});
    const flush = () => {
      frame = null;
      if (pending) { handlers.current.onMove(pending.panel, pending.progress); pending = null; }
    };
    const finish = (result) => {
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; }
      if (pending) { flush(); }
      tracker = null;
      pointerId = null;
      if (result && result.action !== 'none') { handlers.current.onEnd(result); }
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse') { return; }
      active += 1;
      if (active > 1) {  // a second finger: a pinch, not a swipe
        if (tracker) { finish(tracker.cancel()); }
        return;
      }
      const open = handlers.current.getOpen();
      if (isExcludedTarget(e.target) || hasSelection() || !handlers.current.canStart(e.target, open)) { return; }
      tracker = createSwipeTracker({
        dir, viewportWidth: window.innerWidth, openPanel: open,
        panelWidth: (p) => handlers.current.panelWidth(p),
      });
      if (!tracker.start(point(e))) { tracker = null; return; }
      pointerId = e.pointerId;
    };
    const onPointerMove = (e) => {
      if (!tracker || e.pointerId !== pointerId) { return; }
      const before = tracker.phase;
      const {phase, panel, progress} = tracker.move(point(e));
      if (phase === 'vertical' || phase === 'ignored') { tracker = null; return; }
      if (phase !== 'dragging') { return; }
      if (before !== 'dragging') {
        if (hasSelection()) { tracker = null; return; }
        handlers.current.onStart(panel, handlers.current.getOpen());
      }
      pending = {panel, progress};
      if (frame === null) { frame = window.requestAnimationFrame(flush); }
    };
    const onUp = (e) => {
      if (e.pointerType === 'mouse') { return; }
      active = Math.max(0, active - 1);
      if (!tracker || e.pointerId !== pointerId) { return; }
      finish(tracker.end(point(e)));
    };
    const onCancel = (e) => {
      if (e.pointerType === 'mouse') { return; }
      active = Math.max(0, active - 1);
      if (!tracker || e.pointerId !== pointerId) { return; }
      finish(tracker.cancel());
    };

    document.addEventListener('pointerdown', onDown, {passive: true});
    document.addEventListener('pointermove', onPointerMove, {passive: true});
    document.addEventListener('pointerup', onUp, {passive: true});
    document.addEventListener('pointercancel', onCancel, {passive: true});
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      if (frame !== null) { window.cancelAnimationFrame(frame); }
    };
  }, [dir, enabled]);
}
