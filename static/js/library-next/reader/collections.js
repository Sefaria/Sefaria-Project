/**
 * The shared collections the reader writes to: `history` + `streak` (every section shown) and
 * `shelf` (Save to shelf). The schemas and ids are my-library's (`my/collections.js`,
 * COLLECTIONS.md); this module only adapts the reader's call shapes to those factories so
 * `/my/shelf` and `/my/history` see exactly what the reader saved.
 */
import {
  collection, addHistory, saveToShelf as saveRef, isOnShelf as refOnShelf, removeFromShelf as removeRef, shelfId as refShelfId,
} from '../my/collections';

export const history = () => collection('history');
export const streak = () => collection('streak');
export const shelf = () => collection('shelf');

/** Local calendar date `YYYY-MM-DD`. */
export function todayISO(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Record that `ref` (a section) is being read now: a history row titled by the ref, grouped under
 * its book, plus today's streak day (`addHistory` marks it). Null while history is paused.
 */
export function recordReading({ ref, heRef = '', title = '', heTitle = '', persona }) {
  if (!ref) { return null; }
  return addHistory(ref, ref, { heTitle: heRef || heTitle, book: title, persona });
}

export const shelfId = ref => refShelfId(ref);

export function isOnShelf(ref) {
  return refOnShelf(ref);
}

/** Save a ref (or a book, `type: 'book'`) to the shelf; the item is titled by the ref so the shelf reads naturally. */
export function saveToShelf({ ref, heRef = '', title = '', heTitle = '', tags = [], type = 'ref' }) {
  const book = type === 'book';
  return saveRef({ ref, title: book ? title : ref, heTitle: book ? heTitle : (heRef || heTitle), kind: book ? 'book' : 'ref', tags });
}

export function removeFromShelf(ref) {
  return removeRef(ref);
}
