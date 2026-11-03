/**
 * Pinned commentators: one or two works the reader chose (in the associated-texts panel) to
 * show inline under every segment. Pins are kept per corpus, so Rashi pinned on the Torah and
 * Steinsaltz pinned on the Talmud each appear where they belong.
 *
 * Stored in localStorage, read after mount: the server never sees pins, so the server HTML and
 * the first client render agree, and the pinned comments arrive with the other client-side data.
 */
import {useCallback, useEffect, useState} from 'react';

export const PINS_KEY = 'ng.pinnedCommentators';
export const MAX_PINS = 2;

/** The key a section's pins are stored under: its corpus (Tanakh, Talmud, ...) or its top category. */
export function pinScope(section, corpus) {
  return corpus || (section && (section.primaryCategory || (section.categories || [])[0])) || 'other';
}

function storage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch (e) {
    return null;  // storage disabled (Safari private mode, blocked cookies)
  }
}

export function readPins() {
  const store = storage();
  if (!store) { return {}; }
  try {
    const value = JSON.parse(store.getItem(PINS_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? sanitize(value) : {};
  } catch (e) {
    return {};
  }
}

function sanitize(pins) {
  const out = {};
  for (const [scope, list] of Object.entries(pins)) {
    if (Array.isArray(list)) {
      const clean = list.filter(p => p && typeof p.title === 'string' && typeof p.category === 'string').slice(0, MAX_PINS);
      if (clean.length) { out[scope] = clean; }
    }
  }
  return out;
}

export function writePins(pins) {
  const store = storage();
  if (!store) { return; }
  try { store.setItem(PINS_KEY, JSON.stringify(pins)); } catch (e) { /* quota or disabled: pins last this visit */ }
}

export function isPinned(pins, scope, book) {
  return !!(pins[scope] || []).find(p => p.title === book.title && p.category === book.category);
}

/**
 * Pins with `book` toggled in `scope`. Returns the same object when the scope is full (the
 * panel explains why rather than silently replacing a pin).
 */
export function togglePin(pins, scope, book) {
  const list = pins[scope] || [];
  if (isPinned(pins, scope, book)) {
    const rest = list.filter(p => !(p.title === book.title && p.category === book.category));
    const next = {...pins};
    if (rest.length) { next[scope] = rest; } else { delete next[scope]; }
    return next;
  }
  if (list.length >= MAX_PINS) { return pins; }
  const pin = {title: book.title, heTitle: book.heTitle || book.title, category: book.category};
  if (book.shortTitle) { pin.shortTitle = book.shortTitle; pin.heShortTitle = book.heShortTitle || pin.heTitle; }
  return {...pins, [scope]: [...list, pin]};
}

/** [pins, toggle(scope, book)], persisted. Empty until mounted. */
export function usePins() {
  const [pins, setPins] = useState({});
  useEffect(() => { setPins(readPins()); }, []);
  const toggle = useCallback((scope, book) => {
    setPins(prev => {
      const next = togglePin(prev, scope, book);
      if (next !== prev) { writePins(next); }
      return next;
    });
  }, []);
  return [pins, toggle];
}
