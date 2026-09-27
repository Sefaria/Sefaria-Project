/**
 * Horizontal swipe recognition for the reader's panels.
 *
 * Product rules: a swipe starts with a horizontal drag anywhere on the text, except in a
 * reserved zone at both screen edges (the iOS / Android back gestures live there). It is the
 * reader's only horizontal gesture. Directions are logical, so a Hebrew interface mirrors:
 * "toward the trailing edge" is rightward in LTR and leftward in RTL.
 *
 * `classifyDrag` is pure. `useHorizontalSwipe` attaches passive touch listeners to an element
 * and reports completed swipes; the panels pass wires it to the overlay slot.
 */
import {useEffect, useRef} from 'react';

export const SWIPE = {
  edgeZone: 24,      // px reserved at each screen edge for the OS back gesture
  lockDistance: 10,  // px of travel before the drag is locked to an axis
  axisRatio: 1.5,    // |dx| must exceed |dy| * axisRatio to lock horizontal
  commitDistance: 56 // px of horizontal travel for a completed swipe
};

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
  const rightward = dx > 0;
  return (dir === 'rtl' ? !rightward : rightward) ? 'toTrailing' : 'toLeading';
}

/**
 * @param elementRef  the element that receives drags (the text stream)
 * @param dir         the interface direction, 'ltr' | 'rtl'
 * @param onSwipe     ({direction, dx}) => void, called when a horizontal drag completes
 */
export function useHorizontalSwipe(elementRef, {dir, onSwipe, enabled = true}) {
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  useEffect(() => {
    const el = elementRef.current;
    if (!el || !enabled) { return undefined; }
    let start = null;
    let axis = null;
    const onStart = (e) => {
      if (e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      start = {x: t.clientX, y: t.clientY};
      axis = null;
    };
    const onMove = (e) => {
      if (!start || axis === 'vertical' || axis === 'ignored') { return; }
      const t = e.touches[0];
      const kind = classifyDrag(start, {x: t.clientX, y: t.clientY}, window.innerWidth);
      if (kind !== 'pending') { axis = kind; }
    };
    const onEnd = (e) => {
      if (start && axis === 'horizontal') {
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const direction = swipeDirection(dx, dir);
        if (direction && onSwipeRef.current) { onSwipeRef.current({direction, dx}); }
      }
      start = null;
      axis = null;
    };
    el.addEventListener('touchstart', onStart, {passive: true});
    el.addEventListener('touchmove', onMove, {passive: true});
    el.addEventListener('touchend', onEnd, {passive: true});
    el.addEventListener('touchcancel', onEnd, {passive: true});
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [elementRef, dir, enabled]);
}
