/**
 * Show/hide logic for the reader header. The header recedes as forward reading proceeds and
 * returns on a deliberate reverse scroll, near the top, and at the end of the book.
 *
 * `nextHeaderState` is pure so the thresholds can be tested without a browser; the hook
 * applies it to window scroll events and re-renders only when visibility flips.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {subscribeScroll} from './scroll';

export const HEADER_THRESHOLDS = {
  topReveal: 12,     // always visible this close to the top of the document
  hideAfter: 72,     // never hide before scrolling past (about) the header's own height
  downTravel: 10,    // continuous downward travel needed to hide
  upTravel: 36,      // continuous upward travel needed to reveal; larger, so small wobbles don't
  bottomReveal: 4,   // visible again when pinned at the very bottom with nothing more to load
};

export function initialHeaderState(y = 0) {
  return {visible: true, lastY: y, travel: 0, direction: 'none'};
}

/**
 * @param state   {visible, lastY, travel, direction}
 * @param y       clamped scroll offset
 * @param options {maxY, atEnd, thresholds}
 */
export function nextHeaderState(state, y, {maxY = Infinity, atEnd = false, thresholds = HEADER_THRESHOLDS} = {}) {
  const dy = y - state.lastY;
  if (y <= thresholds.topReveal) {
    return {visible: true, lastY: y, travel: 0, direction: dy < 0 ? 'up' : state.direction};
  }
  if (atEnd && maxY - y <= thresholds.bottomReveal) {
    return {visible: true, lastY: y, travel: 0, direction: state.direction};
  }
  if (dy === 0) { return state; }
  const direction = dy > 0 ? 'down' : 'up';
  const travel = (direction === state.direction ? state.travel : 0) + Math.abs(dy);
  let visible = state.visible;
  if (direction === 'down' && visible && y > thresholds.hideAfter && travel >= thresholds.downTravel) {
    visible = false;
  } else if (direction === 'up' && !visible && travel >= thresholds.upTravel) {
    visible = true;
  }
  return {visible, lastY: y, travel: visible === state.visible ? travel : 0, direction};
}

/**
 * @param {boolean} pinned  keep the header visible (e.g. while an overlay is open)
 * @param {boolean} atEnd   the stream has reached the end of the book
 * @returns {{visible, setVisible, rebase}} `rebase(y)` tells the logic about a programmatic
 *   scroll (e.g. content inserted above the viewport) so it isn't read as the user scrolling.
 */
export function useHeaderVisibility({pinned = false, atEnd = false} = {}) {
  const [visible, setVisibleState] = useState(true);
  const stateRef = useRef(initialHeaderState());
  const atEndRef = useRef(atEnd);
  atEndRef.current = atEnd;

  useEffect(() => subscribeScroll(({y, maxY}) => {
    const next = nextHeaderState(stateRef.current, y, {maxY, atEnd: atEndRef.current});
    if (next.visible !== stateRef.current.visible) { setVisibleState(next.visible); }
    stateRef.current = next;
  }), []);

  const setVisible = useCallback((value) => {
    stateRef.current = {...stateRef.current, visible: value, travel: 0};
    setVisibleState(value);
  }, []);

  const rebase = useCallback((y) => {
    stateRef.current = {...stateRef.current, lastY: y, travel: 0};
  }, []);

  return {visible: pinned || visible, setVisible, rebase};
}
