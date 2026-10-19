/**
 * Highlights on segments. The reader exposes no decoration hook, so this module offers two
 * things: `useHighlights(sectionRef)` → `{ 'Genesis 1:3': 'yellow', … }` for a host that wants
 * to render them itself, and a DOM decorator that sets `data-ln-highlight="<color>"` on every
 * `.ln-seg[data-ref]` in the page whenever the `highlights` collection or the stream changes.
 * `mountHighlightDecorator()` is called once from index.js; styles live in styles.css.
 */
import { useEffect, useState } from 'react';
import { collection, collectionOptions, HIGHLIGHT_COLORS } from '../../my/collections';
import { useCollection } from '../../store';

export { HIGHLIGHT_COLORS };

/** `{ ref: color }` for every highlighted ref (the newest row per ref wins). */
export function highlightMap(rows = collection('highlights').list()) {
  const map = {};
  for (const row of rows.slice().reverse()) { if (row.ref) { map[row.ref] = row.color || 'yellow'; } }
  return map;
}

/** Highlight rows whose ref is one of `refs`. */
export function highlightsFor(refs) {
  const set = new Set(refs);
  return collection('highlights').list().filter(h => set.has(h.ref));
}

/** React: the highlight map, narrowed to refs inside `sectionRef` when given. */
export function useHighlights(sectionRef) {
  const { items } = useCollection('highlights', collectionOptions('highlights'));
  const map = highlightMap(items);
  if (!sectionRef) { return map; }
  const prefix = `${sectionRef}:`;
  return Object.fromEntries(Object.entries(map).filter(([ref]) => ref.startsWith(prefix) || ref === sectionRef));
}

/** Apply `data-ln-highlight` to the segment elements under `root`. */
export function applyHighlights(root = document, map = highlightMap()) {
  root.querySelectorAll('.ln-seg[data-ref]').forEach(el => {
    const color = map[el.getAttribute('data-ref')];
    if (color) { el.setAttribute('data-ln-highlight', color); } else if (el.hasAttribute('data-ln-highlight')) { el.removeAttribute('data-ln-highlight'); }
  });
}

let mounted = null;

export function mountHighlightDecorator() {
  if (mounted || typeof document === 'undefined') { return mounted; }
  let frame = null;
  const schedule = () => {
    if (frame !== null) { return; }
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
    frame = raf(() => { frame = null; applyHighlights(); });
  };
  // New segments (a loaded section, a new ref): re-apply. Browsers without MutationObserver only follow store changes.
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(records => { if (records.some(r => r.addedNodes.length)) { schedule(); } }) : null;
  if (observer) { observer.observe(document.body, { childList: true, subtree: true }); }
  // Store changes arrive as a window event (any tab), so a reset store or a new instance never detaches us.
  const onStore = e => { if (!e.detail || e.detail.name === 'highlights') { schedule(); } };
  window.addEventListener('libnext:store', onStore);
  schedule();
  mounted = { stop() { if (observer) { observer.disconnect(); } window.removeEventListener('libnext:store', onStore); mounted = null; }, flush() { frame = null; applyHighlights(); } };
  return mounted;
}
