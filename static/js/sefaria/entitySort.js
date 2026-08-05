/**
 * Sort options and the client-side sort for the search page's entity tabs.
 *
 * Kept apart from the SearchSortDropdown component deliberately: this module is pure data
 * and a pure function with no React, no CSS and no Sefaria singleton, so it can be unit
 * tested directly. SearchSortDropdown re-exports both names, so importers are unaffected.
 *
 * Note this sort runs over the hits already in memory. The API also implements these sorts
 * server-side, but the search page does not yet send `sort` (see "Send the entity `sort` to
 * the API" in docs/arch_docs/search_improvements_arch.md) — until it does, the two
 * implementations have to agree, which is why the comments below insist on reading the
 * backend-derived fields rather than re-deriving them here.
 */

export const ENTITY_SORT_OPTIONS = {
  books: [
    { type: 'relevance',  name: 'Relevance',                       heName: 'רלוונטיות' },
    { type: 'year_asc',   name: 'Composition Date (Oldest First)', heName: 'תאריך חיבור (ישן לחדש)' },
    { type: 'year_desc',  name: 'Composition Date (Newest First)', heName: 'תאריך חיבור (חדש לישן)' },
    { type: 'alpha',      name: 'A-Z',                             heName: 'א-ת' },
  ],
  authors: [
    { type: 'relevance', name: 'Relevance',           heName: 'רלוונטיות' },
    { type: 'year_asc',  name: 'Year (Oldest First)', heName: 'שנה (ישן לחדש)' },
    { type: 'year_desc', name: 'Year (Newest First)', heName: 'שנה (חדש לישן)' },
    { type: 'alpha',     name: 'A-Z',                 heName: 'א-ת' },
  ],
  topics: [
    { type: 'relevance', name: 'Relevance', heName: 'רלוונטיות' },
    { type: 'alpha',     name: 'A-Z',       heName: 'א-ת' },
  ],
};

// A search-page category row (see _category_response in sefaria/helper/search.py): the row a
// Books-tab query gets when it names a category, e.g. "Mishneh Torah". It stands in for that
// whole category's books, so it stays pinned above them under every sort — it is the query's
// answer, not one more result to be ordered.
//
// The `compDate == null` half of the test is what keeps this narrow. Author-works aggregation
// rows are *also* isCategory, but they carry a representative date (the average year of the
// works they collapse) precisely so they can be sorted; those must keep sorting normally.
const isPinnedCategoryRow = (hit) => !!hit.isCategory && hit.compDate == null;

export const sortEntityHits = (hits, type, sortKey) => {
  if (!hits || sortKey === 'relevance') return hits;
  const pinned = hits.filter(isPinnedCategoryRow);
  const sorted = hits.filter(h => !isPinnedCategoryRow(h));
  if (sortKey === 'alpha') {
    const byTitle = (a, b) => (a.title_en || a.title_he || '').localeCompare(b.title_en || b.title_he || '');
    return [...pinned.sort(byTitle), ...sorted.sort(byTitle)];
  }
  // Years reach us from free-form Mongo properties, so a record can carry one as a numeric
  // string ('1804') rather than an int; coerce before comparing — string subtraction happens
  // to work, but '' would coerce to 0 and sort as year zero.
  const toYear = (val) => {
    if (val === null || val === undefined || val === '') { return null; }
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  // Both types sort on the single year the *backend* derived at index time, never on the raw
  // properties: books on `compDate` (Mongo's compDate list collapsed by best_time_period),
  // authors on `sortYear` (deathYear, falling back to birthYear — see _author_sort_year in
  // sefaria/search.py). Re-deriving the author fallback here as `deathYear ?? birthYear` is
  // what let this rule drift out of sync with the server sort, which keyed on a bare
  // deathYear and dropped birth-year-only authors into its undated tail.
  const getYear = (hit) => {
    if (type === 'book')   return toYear(hit.compDate);
    if (type === 'author') return toYear(hit.sortYear);
    return null;
  };
  const asc = sortKey.endsWith('_asc');
  sorted.sort((a, b) => {
    const ya = getYear(a);
    const yb = getYear(b);
    if (ya == null && yb == null) return 0;
    if (ya == null) return 1;
    if (yb == null) return -1;
    return asc ? ya - yb : yb - ya;
  });
  return [...pinned, ...sorted];
};
