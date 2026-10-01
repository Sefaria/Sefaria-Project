/**
 * The shared collections the reader writes to (schemas owned by my-library, PLAN.md):
 * `history` (ref, title, ts, persona), `streak` (dates read) and `shelf` (saved refs with tags).
 * Collections are created lazily with version 1 so the schemas converge with my/collections.js.
 */
import { createCollection } from '../store';

export const history = () => createCollection('history', { version: 1 });
export const streak = () => createCollection('streak', { version: 1 });
export const shelf = () => createCollection('shelf', { version: 1 });

/** Local calendar date `YYYY-MM-DD`. */
export function todayISO(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Record that `ref` is being read now: one history row per ref (re-reading bumps `ts`) and today's streak day. */
export function recordReading({ ref, heRef = '', title = '', heTitle = '', persona }) {
  if (!ref) { return null; }
  const ts = Date.now();
  const row = history().put({ id: `h:${ref}`, ref, heRef, title, heTitle, persona, ts });
  const date = todayISO();
  streak().put({ id: date, date, ts });
  return row;
}

export const shelfId = ref => `s:${ref}`;

export function isOnShelf(ref) {
  return !!shelf().get(shelfId(ref));
}

export function saveToShelf({ ref, heRef = '', title = '', heTitle = '', tags = [], persona, type = 'ref' }) {
  return shelf().put({ id: shelfId(ref), ref, heRef, title, heTitle, tags, persona, type, ts: Date.now() });
}

export function removeFromShelf(ref) {
  return shelf().remove(shelfId(ref));
}
