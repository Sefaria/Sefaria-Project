/**
 * The overlay's state and its browser history.
 *
 * Opening a panel pushes a history entry, and so does every step deeper inside the associated
 * panel (category -> work -> a cited text, the tangent stack). So the browser's Back button,
 * the panel's back button and the Android back gesture all walk that stack and finally close
 * the panel, instead of leaving the page. Each entry's state is
 *   {ngRef, ngOverlay: {type, ref, heRef, stack, depth}}
 * where `depth` counts the overlay entries up to and including this one.
 *
 * The associated overlay: {type: 'associated', ref, heRef, stack: [view, ...]}. Views:
 *   {kind: 'home'}                      the segment's associated texts
 *   {kind: 'category', category}        one category's works
 *   {kind: 'book', key}                 one work's comments on the segment (key: "Category|Title")
 *   {kind: 'ref', ref}                  a text cited from a comment (a tangent)
 *   {kind: 'filter', name}              a `with=` value, until the links resolve it
 */
import {useCallback, useRef, useState} from 'react';
import {OVERLAY} from './context';

export const HOME = {kind: 'home'};

/** The overlay a server-rendered page opens with: `with=` (panel.filter) opens associated texts. */
export function initialOverlay(panel, section) {
  if (!panel || !Array.isArray(panel.filter) || !section || !section.segments.length) { return {type: OVERLAY.NONE}; }
  const highlighted = (panel.highlightedRefs || []).find(r => section.segments.some(s => s.ref === r));
  const segment = section.segments.find(s => s.ref === (highlighted || panel.ref)) || section.segments[0];
  const name = panel.filter[0];
  const stack = name ? [HOME, {kind: 'filter', name}] : [HOME];
  return {type: OVERLAY.ASSOCIATED, ref: segment.ref, heRef: segment.heRef, stack};
}

const historyState = () => (typeof window !== 'undefined' && window.history.state) || null;
const overlayEntry = () => { const s = historyState(); return s && s.ngOverlay ? s.ngOverlay : null; };

/**
 * @param initial   the first overlay (closed, or opened by `with=`)
 * @param urlFor    (overlay) => the URL an overlay entry carries
 */
export function useOverlayState(initial, urlFor) {
  const [overlay, setOverlayState] = useState(initial);
  const current = useRef(overlay);
  const urlForRef = useRef(urlFor);
  urlForRef.current = urlFor;
  const waiters = useRef([]);

  const set = useCallback((next) => {
    current.current = next;
    setOverlayState(next);
  }, []);

  const push = useCallback((next) => {
    const base = historyState() || {};
    const depth = (overlayEntry() ? overlayEntry().depth : 0) + 1;
    const entry = {...next, depth};
    window.history.pushState({...base, ngOverlay: entry}, '', urlForRef.current(entry));
    set(entry);
  }, [set]);

  /** Change the top of the stack in place (a `with=` filter resolving to its work). */
  const replaceView = useCallback((view) => {
    const now = current.current;
    if (now.type !== OVERLAY.ASSOCIATED) { return; }
    const next = {...now, stack: [...now.stack.slice(0, -1), view]};
    const base = historyState() || {};
    if (base.ngOverlay) { window.history.replaceState({...base, ngOverlay: next}, '', urlForRef.current(next)); }
    set(next);
  }, [set]);

  /** Open a panel: one history entry per level, so Back steps out of a deep link level by level. */
  const open = useCallback((next) => {
    if (next.type !== OVERLAY.ASSOCIATED) { push(next); return; }
    const stack = next.stack && next.stack.length ? next.stack : [HOME];
    for (let level = 1; level <= stack.length; level++) { push({...next, stack: stack.slice(0, level)}); }
  }, [push]);

  const pushView = useCallback((view) => {
    const now = current.current;
    if (now.type !== OVERLAY.ASSOCIATED) { return; }
    push({type: now.type, ref: now.ref, heRef: now.heRef, stack: [...now.stack, view]});
  }, [push]);

  /** Go back `steps` overlay entries (through the browser history when the entries are ours). */
  const goBack = useCallback((steps) => {
    const now = current.current;
    if (now.type === OVERLAY.NONE || steps <= 0) { return Promise.resolve(); }
    const depth = now.depth || 0;
    const stack = now.stack || [];
    let next;
    if (now.type === OVERLAY.ASSOCIATED && steps < stack.length) {
      next = {...now, stack: stack.slice(0, stack.length - steps), depth: Math.max(0, depth - steps)};
    } else {
      next = {type: OVERLAY.NONE};
    }
    set(next);  // update at once; the popstate that follows confirms it
    const historySteps = Math.min(steps, depth);
    if (!historySteps) { return Promise.resolve(); }
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      window.history.go(-historySteps);
      setTimeout(resolve, 400);  // popstate is not guaranteed (e.g. history was replaced elsewhere)
    });
  }, [set]);

  const back = useCallback(() => goBack(1), [goBack]);
  const jump = useCallback((index) => {
    const stack = current.current.stack || [];
    return goBack(stack.length - 1 - index);
  }, [goBack]);
  const close = useCallback(() => goBack(Math.max(1, current.current.depth || 0)), [goBack]);

  /**
   * Apply a popstate. Returns true when the entry was an overlay entry (nothing else to do).
   */
  const onPopState = useCallback((state) => {
    const pending = waiters.current;
    waiters.current = [];
    if (state && state.ngOverlay) {
      set(state.ngOverlay);
    } else if (current.current.type !== OVERLAY.NONE) {
      set({type: OVERLAY.NONE});
    }
    pending.forEach(resolve => resolve());
    return !!(state && state.ngOverlay);
  }, [set]);

  /**
   * A server-rendered open overlay has no history entries of its own yet. Give it one per level
   * (the reading URL beneath it), so Back walks the stack and then closes the panel.
   */
  const seedHistory = useCallback((readingState, readingUrl) => {
    const now = current.current;
    if (now.type === OVERLAY.NONE) { return; }
    window.history.replaceState(readingState, '', readingUrl);
    const levels = now.type === OVERLAY.ASSOCIATED ? now.stack.length : 1;
    let entry = null;
    for (let depth = 1; depth <= levels; depth++) {
      entry = now.type === OVERLAY.ASSOCIATED ? {...now, stack: now.stack.slice(0, depth), depth} : {...now, depth};
      window.history.pushState({...readingState, ngOverlay: entry}, '', urlForRef.current(entry));
    }
    set(entry);
  }, [set]);

  return {overlay, open, pushView, replaceView, back, jump, close, onPopState, seedHistory, isOverlayEntry: () => !!overlayEntry()};
}
