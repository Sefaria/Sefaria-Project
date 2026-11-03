/**
 * Continuous reading through a book: the stream of loaded sections, and when to extend it.
 *
 * - Near the bottom, the `next` section is fetched and appended.
 * - Near the top, the `prev` section is fetched right away but inserted only once scrolling
 *   is idle, so content never lands above the viewport mid-fling (iOS Safari would stop the
 *   momentum, and has no native scroll anchoring). TextStream then keeps the reading position
 *   still by scrolling by the inserted height.
 *
 * `streamReducer` and `pickLoad` are pure; `useSectionStream` wires them to the data layer.
 */
import {useCallback, useEffect, useReducer, useRef} from 'react';
import {subscribeScroll} from './scroll';

export const LOAD_MARGIN_VIEWPORTS = 1.5;

export function initialStreamState(section) {
  return {
    sections: section ? [section] : [],
    next: {status: section && section.next ? 'idle' : 'done'},
    prev: {status: section && section.prev ? 'idle' : 'done', pending: null},
  };
}

const first = (state) => state.sections[0];
const last = (state) => state.sections[state.sections.length - 1];
const hasRef = (state, ref) => state.sections.some(s => s.ref === ref);

/** The ref a direction would load next, or null at the edge of the book. */
export function edgeRef(state, dir) {
  const edge = dir === 'next' ? last(state) : first(state);
  return edge ? (dir === 'next' ? edge.next : edge.prev) : null;
}

export function streamReducer(state, action) {
  const {dir} = action;
  switch (action.type) {
    case 'request':
      return {...state, [dir]: {...state[dir], status: 'loading'}};
    case 'failed':
      return {...state, [dir]: {...state[dir], status: 'error'}};
    case 'loaded': {
      const {section} = action;
      const expected = edgeRef(state, dir);
      if (!section || section.ref !== expected || hasRef(state, section.ref)) {
        // Stale (the stream moved on) or a duplicate: drop it.
        return {...state, [dir]: {...state[dir], status: expected ? 'idle' : 'done', pending: null}};
      }
      if (dir === 'next') {
        return {...state, sections: [...state.sections, section], next: {status: section.next ? 'idle' : 'done'}};
      }
      // prev: hold until the scroll is idle.
      return {...state, prev: {status: 'ready', pending: section}};
    }
    case 'insertPrev': {
      const section = state.prev.pending;
      if (!section || section.ref !== edgeRef(state, 'prev')) {
        return {...state, prev: {status: edgeRef(state, 'prev') ? 'idle' : 'done', pending: null}};
      }
      return {...state, sections: [section, ...state.sections], prev: {status: section.prev ? 'idle' : 'done', pending: null}};
    }
    case 'reset':
      return initialStreamState(action.section);
    default:
      return state;
  }
}

/**
 * What to do for a scroll event: 'next' (fetch and append), 'prev' (fetch), 'insertPrev'
 * (splice the fetched prev section in), or null.
 */
export function pickLoad(state, {y, viewportHeight, documentHeight, idle}) {
  const margin = viewportHeight * LOAD_MARGIN_VIEWPORTS;
  const nearBottom = documentHeight - (y + viewportHeight) < margin;
  const nearTop = y < margin;
  if (nearBottom && state.next.status === 'idle' && edgeRef(state, 'next')) { return 'next'; }
  if (nearTop && state.prev.status === 'ready' && idle) { return 'insertPrev'; }
  if (nearTop && state.prev.status === 'idle' && edgeRef(state, 'prev')) { return 'prev'; }
  return null;
}

/**
 * @param initialSection  the server-rendered section
 * @param loadSection     ref -> Promise<section>
 * @param onBeforeInsertPrev  called right before the prev section is inserted, so the caller
 *                            can record a scroll anchor
 */
export function useSectionStream({initialSection, loadSection, onBeforeInsertPrev}) {
  const [state, dispatch] = useReducer(streamReducer, initialSection, initialStreamState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const loadRef = useRef(loadSection);
  loadRef.current = loadSection;
  const beforeInsertRef = useRef(onBeforeInsertPrev);
  beforeInsertRef.current = onBeforeInsertPrev;

  const load = useCallback((dir) => {
    const ref = edgeRef(stateRef.current, dir);
    if (!ref) { return; }
    dispatch({type: 'request', dir});
    let request;
    try {
      request = Promise.resolve(loadRef.current(ref));  // start the fetch now, not on a later tick
    } catch (e) {
      request = Promise.reject(e);
    }
    request
      .then(section => dispatch({type: 'loaded', dir, section}))
      .catch(() => dispatch({type: 'failed', dir}));
  }, []);

  const handle = useCallback((metrics) => {
    const action = pickLoad(stateRef.current, metrics);
    if (action === 'insertPrev') {
      if (beforeInsertRef.current) { beforeInsertRef.current(); }
      dispatch({type: 'insertPrev'});
    } else if (action) {
      load(action);
    }
  }, [load]);

  useEffect(() => subscribeScroll(handle), [handle]);

  const retry = useCallback((dir) => load(dir), [load]);
  const reset = useCallback((section) => dispatch({type: 'reset', section}), []);

  return {state, retry, reset, check: handle};
}
