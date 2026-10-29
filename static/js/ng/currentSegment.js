/**
 * The "current segment": the segment nearest the vertical center of the viewport. The header
 * shows its ref, and the associated/config panels anchor to it.
 */
import {useEffect, useRef, useState} from 'react';
import {subscribeScroll} from './scroll';

/**
 * Index of the segment nearest to `y` (distance 0 when its rect contains `y`).
 * `getRect(i)` returns segment i's {top, bottom}; segments are in document order, so tops
 * ascend. Inline (continuous) segments may overlap, which is fine. O(log n) calls to getRect.
 */
export function nearestIndex(count, getRect, y) {
  if (!count) { return -1; }
  // Last segment whose top is at or above y.
  let lo = 0, hi = count - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (getRect(mid).top <= y) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  if (found === -1) { return 0; }
  const distance = (r) => (y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0));
  if (found + 1 < count && distance(getRect(found + 1)) < distance(getRect(found))) { return found + 1; }
  return found;
}

export const SEGMENT_SELECTOR = '[data-ng="segment"]';

/**
 * Read the current segment from the DOM. Returns {ref, heRef, sectionRef} or null.
 */
export function findCurrentSegment(root, centerY) {
  if (!root) { return null; }
  const nodes = root.querySelectorAll(SEGMENT_SELECTOR);
  if (!nodes.length) { return null; }
  const cache = new Map();
  const getRect = (i) => {
    if (!cache.has(i)) { cache.set(i, nodes[i].getBoundingClientRect()); }
    return cache.get(i);
  };
  const index = nearestIndex(nodes.length, getRect, centerY);
  const node = nodes[index];
  return node ? {
    ref: node.getAttribute('data-ref'),
    heRef: node.getAttribute('data-he-ref'),
    sectionRef: node.getAttribute('data-section-ref'),
  } : null;
}

/**
 * Track the current segment. `rootRef` is the stream element; `deps` re-evaluate it when the
 * content changes (a section was added, the language changed).
 */
export function useCurrentSegment(rootRef, deps = []) {
  const [current, setCurrent] = useState(null);
  const currentRef = useRef(null);
  useEffect(() => {
    const update = ({viewportHeight}) => {
      const next = findCurrentSegment(rootRef.current, viewportHeight / 2);
      if (next && (!currentRef.current || next.ref !== currentRef.current.ref)) {
        currentRef.current = next;
        setCurrent(next);
      }
    };
    update({viewportHeight: window.innerHeight});
    return subscribeScroll(update);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return current;
}
