/**
 * Manuscript pages for a ref: the classic sidebar reads them from `/api/related` into
 * `Sefaria._manuscripts`; here the cache is checked first, then `/api/manuscripts/<ref>` is
 * fetched through the data layer's promise helper. Pages are deduplicated by image.
 */
import Sefaria from '../../../sefaria/sefaria';

export function dedupePages(pages) {
  const seen = new Set();
  return (Array.isArray(pages) ? pages : []).filter(p => {
    const key = p.image_url || p.page_id;
    if (!key || seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

export function fetchManuscripts(ref) {
  let cached = [];
  try { cached = Sefaria.manuscriptsByRef(ref) || []; } catch (e) { cached = []; }
  if (cached.length) { return Promise.resolve(dedupePages(cached)); }
  const url = `${Sefaria.apiHost}/api/manuscripts/${Sefaria.normRef(ref)}`;
  return Promise.resolve(Sefaria._ApiPromise(url)).then(dedupePages);   // _ApiPromise is a jQuery deferred: no .catch
}
