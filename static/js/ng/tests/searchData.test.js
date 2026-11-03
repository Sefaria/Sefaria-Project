/**
 * Search-in-book helpers (searchData.js): the execute_query arguments, and turning
 * Elasticsearch hits (one per version) into one row per passage with safe snippets.
 */
import {
  emptyResults, hasMore, isSearchable, mergeHits, normalizeQuery, PAGE_SIZE, queryArgs, reportedTotal, snippetRuns,
} from '../searchData';
import {SearchTotal} from '../../sefaria/searchTotal';

const RESPONSE = require('./fixtures/search-genesis-light.json');

test('the query SidebarSearch sends for "search in this text", filtered to the book path', () => {
  expect(queryArgs({query: 'light', path: 'Tanakh/Torah/Genesis'})).toEqual({
    query: 'light', type: 'text', applied_filters: ['Tanakh/Torah/Genesis'], appliedFilterAggTypes: ['path'],
    aggregationsToUpdate: [], size: PAGE_SIZE, field: 'naive_lemmatizer', sort_type: 'chronological', exact: false,
  });
  expect(queryArgs({query: 'light', path: 'p', start: 100}).start).toBe(100);
  expect('start' in queryArgs({query: 'light', path: 'p', start: 0})).toBe(false);  // execute_query: no start = a new query
});

test('queries: trimmed, and two characters before searching', () => {
  expect(normalizeQuery('  let  there ')).toBe('let there');
  expect(isSearchable('l')).toBe(false);
  expect(isSearchable('אור')).toBe(true);
});

describe('snippets', () => {
  test('<b> becomes a marked run; other markup and entities become text', () => {
    expect(snippetRuns('Let there be <b>light</b>, and there was <b>light</b>.')).toEqual([
      {text: 'Let there be ', mark: false}, {text: 'light', mark: true},
      {text: ', and there was ', mark: false}, {text: 'light', mark: true}, {text: '.', mark: false},
    ]);
    const runs = snippetRuns('And God called the <b>light</b> Day, <i>and</i> the darkness &amp; <script>alert(1)</script>');
    expect(runs.map(r => r.text).join('')).toBe('And God called the light Day, and the darkness & alert(1)');
    expect(runs.some(r => /[<>]/.test(r.text))).toBe(false);
  });

  test('empty highlights give no runs', () => {
    expect(snippetRuns('')).toEqual([]);
    expect(snippetRuns(null)).toEqual([]);
  });
});

describe('merging hits', () => {
  const hits = RESPONSE.hits.hits;

  test('one row per ref, in arrival order, with one Hebrew and one English snippet', () => {
    const {rows, seen, added} = mergeHits(emptyResults(), hits);
    expect(rows.map(r => r.ref)).toEqual(['Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5']);
    expect(added).toBe(9);
    expect(seen.size).toBe(9);
    const [first] = rows;
    expect(first.heRef).toBe('בראשית א׳:ג׳');
    expect(first.versions).toBe(5);
    expect(first.en).toBe(hits[0].highlight.naive_lemmatizer[0]);  // the best-ranked version's snippet
    expect(first.he).toMatch(/<b>אור<\/b>/);
    expect(rows[2].he).toBeNull();
  });

  test('a later page that repeats the hits so far (execute_query accumulates) adds only the new ones', () => {
    const page1 = mergeHits(emptyResults(), hits.slice(0, 5));
    const page2 = mergeHits(page1, hits);
    expect(page2.added).toBe(4);
    expect(page2.rows.map(r => r.ref)).toEqual(['Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5']);
  });

  test('more pages: only after a full page, and until the reported total', () => {
    expect(hasMore({added: PAGE_SIZE, seenCount: 100, total: 250})).toBe(true);
    expect(hasMore({added: PAGE_SIZE, seenCount: 250, total: 250})).toBe(false);
    expect(hasMore({added: 9, seenCount: 9, total: 57})).toBe(false);
    expect(hasMore({added: PAGE_SIZE, seenCount: 100, total: null})).toBe(true);
    expect(reportedTotal({hits: {total: new SearchTotal({value: 57})}})).toBe(57);
    expect(reportedTotal({hits: {total: {value: 0}}})).toBeNull();
    expect(reportedTotal({})).toBeNull();
  });
});
