/**
 * Search logic without React: URL state, the arguments for `Sefaria.search.execute_query`
 * (the same POST /api/search-wrapper/es8 path the classic app uses), hit shaping, the
 * category facet tree, client-side era/version/language filters and CSV export.
 */
import Sefaria from '../../sefaria/sefaria';
import { refToUrl } from './refs';

export const PAGE_SIZE = 20;
export const SORTS = ['relevance', 'chronological'];
export const LANGS = ['all', 'he', 'en'];

/** Eras by composition year (negative = BCE); `comp_date` on a hit is the start year. */
export const ERAS = [
  { id: 'biblical', key: 'era.biblical', to: -300 },
  { id: 'secondTemple', key: 'era.secondTemple', from: -300, to: 220 },
  { id: 'amoraim', key: 'era.amoraim', from: 220, to: 600 },
  { id: 'geonim', key: 'era.geonim', from: 600, to: 1050 },
  { id: 'rishonim', key: 'era.rishonim', from: 1050, to: 1550 },
  { id: 'acharonim', key: 'era.acharonim', from: 1550, to: 1850 },
  { id: 'modern', key: 'era.modern', from: 1850 },
];

export function eraOf(compDate) {
  if (typeof compDate !== 'number' || Number.isNaN(compDate)) { return null; }
  const era = ERAS.find(e => (e.from === undefined || compDate >= e.from) && (e.to === undefined || compDate < e.to));
  return era ? era.id : null;
}

/** `/search?q=…` params → state. Unknown values fall back to defaults. */
export function parseSearchParams(query = {}) {
  const paths = (query.path || '').split('|').map(s => s.trim()).filter(Boolean);
  return {
    q: (query.q || '').trim(),
    exact: query.exact === '1',
    sort: SORTS.includes(query.sort) ? query.sort : 'relevance',
    paths,
    lang: LANGS.includes(query.tl) ? query.tl : 'all',   // `tl`: `lang` is the interface-language param
    era: ERAS.some(e => e.id === query.era) ? query.era : '',
    version: query.version || '',
  };
}

export function buildSearchUrl(state) {
  const p = new URLSearchParams();
  if (state.q) { p.set('q', state.q); }
  if (state.exact) { p.set('exact', '1'); }
  if (state.sort && state.sort !== 'relevance') { p.set('sort', state.sort); }
  if (state.paths && state.paths.length) { p.set('path', state.paths.join('|')); }
  if (state.lang && state.lang !== 'all') { p.set('tl', state.lang); }
  if (state.era) { p.set('era', state.era); }
  if (state.version) { p.set('version', state.version); }
  const s = p.toString();
  return '/search' + (s ? `?${s}` : '');
}

/** The key that decides whether a new server query is needed (client-only filters excluded). */
export function serverKey(state) {
  return JSON.stringify([state.q, state.exact, state.sort, state.paths]);
}

/** Arguments for `Sefaria.search.execute_query` (see static/js/sefaria/search.js). */
export function queryArgs(state, { start = 0, size = PAGE_SIZE, withAggs = true, success, error } = {}) {
  return {
    query: state.q,
    type: 'text',
    field: state.exact ? 'exact' : 'naive_lemmatizer',
    exact: state.exact,
    size,
    start,
    applied_filters: state.paths,
    appliedFilterAggTypes: state.paths.map(() => 'path'),
    aggregationsToUpdate: withAggs ? ['path'] : [],
    sort_type: state.sort,
    success,
    error,
  };
}

/** Merge a response page into what is shown, by `_id` (the classic queue may resend earlier hits). */
export function mergeHits(prev, incoming) {
  const seen = new Set(prev.map(h => h._id));
  const out = prev.slice();
  for (const hit of incoming || []) {
    if (!seen.has(hit._id)) { seen.add(hit._id); out.push(hit); }
  }
  return out;
}

/** Hits for the same ref in several versions collapse into one with `duplicates`. */
export function collapseVersions(hits) {
  const byRef = new Map();
  for (const hit of hits) {
    const ref = hit._source && hit._source.ref;
    if (!byRef.has(ref)) { byRef.set(ref, []); continue; }
    byRef.get(ref).push(hit);
  }
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const ref = hit._source && hit._source.ref;
    if (seen.has(ref)) { continue; }
    seen.add(ref);
    const group = [hit, ...byRef.get(ref)].sort((a, b) => (a._source.version_priority || 1000) - (b._source.version_priority || 1000));
    out.push(group.length > 1 ? { ...group[0], duplicates: group.slice(1) } : group[0]);
  }
  return out;
}

export function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** A hit → what a result card needs. */
export function hitToResult(hit) {
  const s = hit._source || {};
  let snippet;
  if (hit.highlight) {
    const field = Object.keys(hit.highlight)[0];
    snippet = (hit.highlight[field] || []).join(' … ');
  } else {
    snippet = stripTags(s.exact || s.naive_lemmatizer || '').slice(0, 300);
  }
  snippet = snippet.replace(/^[\s.,;:!\-)\]]+/, '');
  const snippetLang = Sefaria.hebrew && Sefaria.hebrew.isHebrew ? (Sefaria.hebrew.isHebrew(stripTags(snippet)) ? 'he' : 'en') : (s.lang || 'en');
  const path = s.path || (s.categories || []).join('/');
  return {
    id: hit._id,
    ref: s.ref,
    heRef: s.heRef || s.ref,
    url: refToUrl(s.ref),
    path,
    categories: s.categories || path.split('/').slice(0, -1),
    primaryCategory: (s.categories && s.categories[0]) || path.split('/')[0] || '',
    lang: s.lang || snippetLang,
    version: s.version || '',
    compDate: typeof s.comp_date === 'number' ? s.comp_date : null,
    era: eraOf(s.comp_date),
    snippetHtml: snippet,
    snippetLang,
    duplicates: (hit.duplicates || []).length,
  };
}

function hebrewTitle(segment) {
  const idx = Sefaria.index ? Sefaria.index(segment) : null;
  if (idx && idx.heTitle) { return idx.heTitle; }
  const term = Sefaria.hebrewTerm ? Sefaria.hebrewTerm(segment) : segment;
  return term || segment;
}

/**
 * `aggregations.path.buckets` ([{ key: 'Tanakh/Torah/Genesis', doc_count }]) → a tree of
 * `{ key, title, heTitle, count, children }`, ordered like the library TOC when the TOC is
 * loaded, else alphabetically. Counts roll up to parents.
 */
export function buildFacetTree(buckets = [], { maxDepth = Infinity } = {}) {
  const lookup = Sefaria._tocOrderLookup || {};
  const known = Object.keys(lookup).length > 0;
  let rows = buckets.filter(b => b && b.key && b.doc_count > 0);
  if (known) { rows = rows.filter(b => lookup[b.key] !== undefined); }
  rows = rows.slice().sort((a, b) => (known && Sefaria.compareSearchCatPaths ? Sefaria.compareSearchCatPaths(a.key, b.key) : a.key.localeCompare(b.key)));
  const roots = [];
  const registry = {};
  for (const row of rows) {
    const parts = row.key.split('/');
    let parent = null;
    for (let i = 0; i < Math.min(parts.length, maxDepth); i++) {
      const key = parts.slice(0, i + 1).join('/');
      let node = registry[key];
      if (!node) {
        node = { key, title: parts[i], heTitle: hebrewTitle(parts[i]), count: 0, children: [] };
        registry[key] = node;
        (parent ? parent.children : roots).push(node);
      }
      node.count += row.doc_count;
      parent = node;
    }
  }
  return { roots, registry };
}

/** Does `path` fall under one of the selected facet keys? */
export function underPaths(path, paths) {
  if (!paths || !paths.length) { return true; }
  return paths.some(p => path === p || path.startsWith(p + '/'));
}

/** Toggle a facet key; selecting a parent drops its selected descendants and vice versa. */
export function togglePath(paths, key) {
  if (paths.includes(key)) { return paths.filter(p => p !== key); }
  return [...paths.filter(p => !(p.startsWith(key + '/') || key.startsWith(p + '/'))), key];
}

/** Client-side filters over loaded results (the API has no language/era/version filter). */
export function applyClientFilters(results, { lang = 'all', era = '', version = '' } = {}) {
  return results.filter(r =>
    (lang === 'all' || r.lang === lang) &&
    (!era || r.era === era) &&
    (!version || r.version === version));
}

export function versionsIn(results) {
  const counts = new Map();
  results.forEach(r => { if (r.version) { counts.set(r.version, (counts.get(r.version) || 0) + 1); } });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([version, count]) => ({ version, count }));
}

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function resultsToCsv(results, { origin = 'https://www.sefaria.org' } = {}) {
  const header = ['ref', 'heRef', 'path', 'version', 'lang', 'comp_date', 'snippet', 'url'];
  const rows = results.map(r => [r.ref, r.heRef, r.path, r.version, r.lang, r.compDate === null ? '' : r.compDate, stripTags(r.snippetHtml), origin + r.url]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** The total from a response: a `SearchTotal` (classic) or `{ value, relation }` (raw ES). */
export function totalOf(response) {
  const total = response && response.hits && response.hits.total;
  if (!total) { return { value: 0, exact: true }; }
  if (typeof total.getValue === 'function') { return { value: total.getValue(), exact: !(total.relation && total.relation !== 'eq') }; }
  if (typeof total === 'number') { return { value: total, exact: true }; }
  return { value: total.value || 0, exact: !total.relation || total.relation === 'eq' };
}

/** Grade tags are a faked educator aid: a stable hash of the ref into three bands. */
export const GRADES = ['elementary', 'middle', 'high'];
export function gradeOf(ref) {
  let h = 0;
  for (const ch of String(ref || '')) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; }
  return GRADES[h % GRADES.length];
}
