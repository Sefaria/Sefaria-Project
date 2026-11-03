/**
 * Classify a library pathname: is it a book-level ref (`/Genesis`, `/Mishnah_Berakhot`,
 * `/Rashi_on_Genesis`), a ref into a text (`/Genesis.1`, `/Berakhot.2a`, `/Pesach_Haggadah,_Kadesh`)
 * or not a ref at all? Pure and synchronous: it only reads the TOC caches `Sefaria.setup()` fills
 * (`Sefaria.index`, `Sefaria.booksDict`), so it is safe inside a route `match`.
 *
 *   import { refKind, parseRefPath } from '../browse/refKind';
 *   refKind('/Genesis')        → 'book'
 *   refKind('/Genesis.1')      → 'ref'
 *   refKind('/texts/Tanakh')   → null
 *   parseRefPath('/Genesis.1') → { kind: 'ref', title: 'Genesis', book: 'Genesis', address: '.1' }
 *
 * A path is book-level when a known title (canonical or variant) is the whole segment. Anything
 * after a known title that starts with a separator (space, `.`, `:`, `,`) is an address or a
 * node name, so the reader owns it. `Jobs` is not `Job`: the remainder must start with a separator.
 */
import Sefaria from '../../sefaria/sefaria';
import { NOT_A_REF } from '../placeholders';

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

function isKnownTitle(title) {
  if (Sefaria.index(title)) { return true; }
  return !!(Sefaria.booksDict && title in Sefaria.booksDict);
}

/** `{ kind, title, book, address }` or null. `title` is the canonical index title when known. */
export function parseRefPath(pathname) {
  const m = /^\/([^/?#]+)\/?$/.exec(pathname || '');
  if (!m) { return null; }
  const segment = safeDecode(m[1]).replace(/_/g, ' ').trim();
  if (!segment || NOT_A_REF.has(segment) || NOT_A_REF.has(segment.toLowerCase())) { return null; }
  if (/\.(html|js|css|png|svg|ico|json|xml|txt)$/.test(segment)) { return null; }
  for (let i = segment.length; i > 0; i--) {
    const book = segment.slice(0, i);
    if (!isKnownTitle(book)) { continue; }
    const address = segment.slice(i);
    if (address && !/^[ .:,]/.test(address)) { continue; }
    const index = Sefaria.index(book);
    const title = index ? index.title : book;
    return { kind: address ? 'ref' : 'book', title, book, address };
  }
  return null;
}

/** `'book'`, `'ref'` or null. */
export function refKind(pathname) {
  const parsed = parseRefPath(pathname);
  return parsed ? parsed.kind : null;
}

/** Route matcher for the book page: claims only book-level paths. */
export function matchBook(pathname) {
  const parsed = parseRefPath(pathname);
  return parsed && parsed.kind === 'book' ? { title: parsed.title } : null;
}
