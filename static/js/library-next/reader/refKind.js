/**
 * Which library URLs the reader owns. A path is a reader ref when it is one segment, not a
 * classic page (NOT_A_REF), and parses to a sectioned ref: `/Genesis.1`, `/Genesis.1.3`,
 * `/Berakhot.2a`, `/Rashi_on_Genesis.1.1.1`, `/Genesis.1.1-3`. Book-level paths (`/Genesis`)
 * belong to the browse agent's `book` route and anything unknown falls through to the server.
 *
 * Parsing uses `Sefaria.parseRef` once /data.js has loaded (`Sefaria.books`); without book data
 * (tests, a failed data load) a shape heuristic stands in, so the matcher never claims a bare
 * title it cannot verify.
 *
 * Handoff: the browse agent is writing `browse/refKind.js` in parallel; `classifyPath` here is
 * the reader's minimal equivalent and can be swapped for the shared helper when it lands.
 */
import Sefaria from '../../sefaria/sefaria';
import { NOT_A_REF } from '../placeholders';

const FILE_RE = /\.(html?|js|css|png|jpe?g|gif|svg|ico|json|xml|txt|map|webmanifest)$/i;
// "Genesis 1", "Berakhot 2a", "Rashi on Genesis 1:1:1", "Genesis 1:1-3", "Shabbat 2a:5-2b:8"
const SHAPE_RE = /^\D\S*(?: \S+)*? \d+[ab]?(?::\d+[ab]?)*(?:-\d+[ab]?(?::\d+[ab]?)*)?$/;

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

export function hasBookData() {
  return !!(Sefaria.books && Sefaria.books.length);
}

/** `Genesis.1.3-5` → `Genesis 1:3-5` without consulting book data. */
export function urlToHumanRef(segment) {
  const flat = segment.replace(/_/g, ' ').trim();
  const m = /^(.+?)[. ](\d.*)$/.exec(flat);
  if (!m) { return flat; }
  return `${m[1]} ${m[2].replace(/\./g, ':')}`;
}

/**
 * `{ tref, kind: 'ref' | 'book', book, index }` for a library path, or null when the path is not
 * a text at all. `kind: 'ref'` is section or segment level (ranges included).
 */
export function classifyPath(pathname) {
  const m = /^\/([^/]+)\/?$/.exec(pathname || '');
  if (!m) { return null; }
  const segment = safeDecode(m[1]);
  if (!segment || NOT_A_REF.has(segment) || NOT_A_REF.has(segment.toLowerCase()) || FILE_RE.test(segment)) { return null; }
  if (!hasBookData()) {
    const guess = urlToHumanRef(segment);
    return SHAPE_RE.test(guess) ? { tref: guess, kind: 'ref', book: guess.replace(/ \d.*$/, ''), index: null } : null;
  }
  const parsed = Sefaria.parseRef(segment);
  if (!parsed || parsed.error || !parsed.book || parsed.book === 'Sheet') { return null; }
  if (!parsed.sections.length) { return { tref: parsed.book, kind: 'book', book: parsed.book, index: parsed.index }; }
  return { tref: Sefaria.humanRef(segment), kind: 'ref', book: parsed.book, index: parsed.index };
}

/** Router `match` for the `ref` route: params for section/segment refs, null for everything else. */
export function matchReaderRef(pathname) {
  const c = classifyPath(pathname);
  return c && c.kind === 'ref' ? { tref: c.tref, book: c.book } : null;
}

/** `/Genesis.1.3` for a human ref; uses the data layer's normalizer when book data is loaded. */
export function refToPath(ref) {
  if (hasBookData()) { return '/' + Sefaria.normRef(ref); }
  const m = /^(.*?) (\d.*)$/.exec(ref);
  if (!m) { return '/' + ref.replace(/ /g, '_'); }
  return `/${m[1].replace(/ /g, '_')}.${m[2].replace(/:/g, '.')}`;
}
