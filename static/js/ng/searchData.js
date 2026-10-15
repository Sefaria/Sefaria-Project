/**
 * Search within the current book: the query arguments for Sefaria.search.execute_query (the
 * same shape SidebarSearch.jsx / ElasticSearchQuerier send for "search in this text"), and the
 * pure steps that turn its hits into the rows the search sheet shows.
 *
 * Elasticsearch returns one hit per version of a segment (Genesis 1:3 comes back once for
 * each of its dozen English translations and its Hebrew versions). The sheet shows one row per
 * ref, with one Hebrew and one English snippet, taken from the best-ranked version of each.
 */

export const PAGE_SIZE = 100;         // hits per request, as ElasticSearchQuerier.querySize.text
export const MIN_QUERY_LENGTH = 2;
export const DEBOUNCE_MS = 300;

/** Arguments for Sefaria.search.execute_query: text search, filtered to the book's path. */
export function queryArgs({query, path, start = 0, size = PAGE_SIZE}) {
  const args = {
    query,
    type: 'text',
    applied_filters: [path],
    appliedFilterAggTypes: ['path'],
    aggregationsToUpdate: [],
    size,
    field: 'naive_lemmatizer',
    sort_type: 'chronological',   // book order, as SidebarSearch
    exact: false,
  };
  if (start) { args.start = start; }
  return args;
}

export function normalizeQuery(query) {
  return String(query || '').replace(/\s+/g, ' ').trim();
}

export function isSearchable(query) {
  return normalizeQuery(query).length >= MIN_QUERY_LENGTH;
}

const decodeEntities = (s) => s
  .replace(/&nbsp;|&thinsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/**
 * A highlight string ("...there be <b>light</b>...") as [{text, mark}] runs. Every tag other than
 * <b> is dropped, so the snippet renders as text: nothing from the index reaches innerHTML.
 */
export function snippetRuns(html) {
  if (!html) { return []; }
  const runs = [];
  const re = /<b>([\s\S]*?)<\/b>/g;
  let last = 0;
  let m;
  const push = (text, mark) => {
    const clean = decodeEntities(text.replace(/<[^>]*>/g, ''));
    if (!clean) { return; }
    const prev = runs[runs.length - 1];
    if (prev && prev.mark === mark) { prev.text += clean; } else { runs.push({text: clean, mark}); }
  };
  while ((m = re.exec(html)) !== null) {
    push(html.slice(last, m.index), false);
    push(m[1], true);
    last = m.index + m[0].length;
  }
  push(html.slice(last), false);
  // Collapse whitespace across runs, keeping a single space where the index had any.
  runs.forEach(r => { r.text = r.text.replace(/\s+/g, ' '); });
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^\s+/, '');
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  }
  return runs.filter(r => r.text);
}

function highlightOf(hit) {
  const h = hit.highlight || {};
  const key = Object.keys(h)[0];
  const values = key ? h[key] : null;
  return Array.isArray(values) ? values.join(' … ') : (values || '');
}

function hitLang(hit) {
  const src = hit._source || {};
  if (src.lang === 'he' || src.lang === 'en') { return src.lang; }
  return /[֐-׿]/.test(highlightOf(hit)) ? 'he' : 'en';
}

/**
 * Fold new hits into the rows so far. Hits are unique by `_id`; rows are unique by ref and keep
 * the order their first hit arrived in (book order). Returns {rows, seen, added}, where `added`
 * counts the hits that were new (execute_query hands back the accumulated hits on later pages).
 */
export function mergeHits(state, hits) {
  const seen = new Set(state.seen);
  const rows = state.rows.slice();
  const byRef = new Map(rows.map((r, i) => [r.ref, i]));
  let added = 0;
  for (const hit of hits || []) {
    const id = hit._id || `${(hit._source || {}).ref}|${(hit._source || {}).version}|${hitLang(hit)}`;
    if (seen.has(id)) { continue; }
    seen.add(id);
    added += 1;
    const src = hit._source || {};
    if (!src.ref) { continue; }
    const lang = hitLang(hit);
    const snippet = highlightOf(hit);
    let index = byRef.get(src.ref);
    if (index === undefined) {
      index = rows.length;
      byRef.set(src.ref, index);
      rows.push({ref: src.ref, heRef: src.heRef || src.ref, he: null, en: null, versions: 0});
    }
    const row = {...rows[index]};
    row.versions += 1;
    if (!row.heRef && src.heRef) { row.heRef = src.heRef; }
    if (!row[lang] && snippet) { row[lang] = snippet; }
    rows[index] = row;
  }
  return {rows, seen, added};
}

export const emptyResults = () => ({rows: [], seen: new Set(), added: 0});

/** The total the response reports, or null when it doesn't know (a merged Dicta query). */
export function reportedTotal(data) {
  const total = data && data.hits && data.hits.total;
  if (total === undefined || total === null) { return null; }
  const value = typeof total.getValue === 'function' ? total.getValue() : (typeof total === 'object' ? total.value : total);
  return typeof value === 'number' && value > 0 ? value : null;
}

/** Whether another page may have more: the last page was full, and the total (if known) isn't reached. */
export function hasMore({added, seenCount, total, size = PAGE_SIZE}) {
  if (added < size) { return false; }
  return total === null || total === undefined ? true : seenCount < total;
}
