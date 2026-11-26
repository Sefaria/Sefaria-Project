import Sefaria from '../../../sefaria/sefaria';
import fixture from './fixtures/search-wrapper.json';
import {
  parseSearchParams, buildSearchUrl, queryArgs, mergeHits, collapseVersions, hitToResult, buildFacetTree,
  togglePath, underPaths, applyClientFilters, versionsIn, resultsToCsv, totalOf, eraOf, stripTags, gradeOf, serverKey,
} from '../searchModel';

beforeAll(() => { Sefaria._tocOrderLookup = {}; });

test('URL state round-trips and ignores junk', () => {
  const state = parseSearchParams({ q: ' light ', exact: '1', sort: 'chronological', path: 'Tanakh|Talmud/Bavli', tl: 'he', era: 'rishonim', version: 'JPS' });
  expect(state).toEqual({ q: 'light', exact: true, sort: 'chronological', paths: ['Tanakh', 'Talmud/Bavli'], lang: 'he', era: 'rishonim', version: 'JPS' });
  expect(buildSearchUrl(state)).toBe('/search?q=light&exact=1&sort=chronological&path=Tanakh%7CTalmud%2FBavli&tl=he&era=rishonim&version=JPS');
  expect(parseSearchParams({ q: 'x', sort: 'nope', tl: 'fr', era: 'zzz' })).toEqual({ q: 'x', exact: false, sort: 'relevance', paths: [], lang: 'all', era: '', version: '' });
  expect(buildSearchUrl(parseSearchParams({}))).toBe('/search');
  expect(serverKey(parseSearchParams({ q: 'a', tl: 'he' }))).toBe(serverKey(parseSearchParams({ q: 'a', tl: 'en' })));
});

test('queryArgs mirrors the classic execute_query arguments', () => {
  const state = parseSearchParams({ q: 'light', path: 'Tanakh' });
  const args = queryArgs(state, { start: 20, withAggs: false });
  expect(args).toMatchObject({ query: 'light', type: 'text', field: 'naive_lemmatizer', exact: false, size: 20, start: 20, applied_filters: ['Tanakh'], appliedFilterAggTypes: ['path'], aggregationsToUpdate: [], sort_type: 'relevance' });
  expect(queryArgs(parseSearchParams({ q: 'אור', exact: '1' })).field).toBe('exact');
  expect(queryArgs(state).aggregationsToUpdate).toEqual(['path']);
});

test('hits merge by id and collapse versions by ref', () => {
  const hits = fixture.hits.hits;
  expect(mergeHits(hits.slice(0, 3), hits.slice(1, 5))).toHaveLength(5);
  const collapsed = collapseVersions(hits);
  expect(collapsed).toHaveLength(6);
  expect(collapsed[0]._source.ref).toBe('Genesis 1:3');
  expect(collapsed[0].duplicates).toHaveLength(2);
  expect(collapsed[0]._source.version_priority).toBe(1);
});

test('hitToResult shapes a card', () => {
  const r = hitToResult(collapseVersions(fixture.hits.hits)[0]);
  expect(r).toMatchObject({ ref: 'Genesis 1:3', heRef: 'בראשית א׳:ג׳', url: '/Genesis.1.3', path: 'Tanakh/Torah/Genesis', primaryCategory: 'Tanakh', lang: 'en', era: 'biblical', duplicates: 2, snippetLang: 'en' });
  expect(r.snippetHtml).toContain('<b>light</b>');
  const he = hitToResult(fixture.hits.hits[2]);
  expect(he.snippetLang).toBe('he');
  expect(hitToResult({ _id: 'x', _source: { ref: 'Job 1:1', exact: 'Plain <i>text</i>', comp_date: 'n/a' } })).toMatchObject({ snippetHtml: 'Plain text', era: null, compDate: null });
});

test('eras', () => {
  expect(eraOf(-1400)).toBe('biblical');
  expect(eraOf(450)).toBe('amoraim');
  expect(eraOf(1075)).toBe('rishonim');
  expect(eraOf(1900)).toBe('modern');
  expect(eraOf(null)).toBeNull();
});

test('facet tree rolls counts up and respects maxDepth', () => {
  const { roots, registry } = buildFacetTree(fixture.aggregations.path.buckets);
  const tanakh = roots.find(n => n.key === 'Tanakh');
  expect(tanakh.count).toBe(310 + 120 + 260 + 410 + 95);
  expect(tanakh.children.map(c => c.title)).toEqual(['Prophets', 'Rishonim on Tanakh', 'Torah', 'Writings']);
  expect(registry['Talmud/Bavli'].count).toBe(320);
  expect(roots.map(r => r.key)).toEqual(['Halakhah', 'Kabbalah', 'Liturgy', 'Midrash', 'Talmud', 'Tanakh']);
  const shallow = buildFacetTree(fixture.aggregations.path.buckets, { maxDepth: 1 });
  expect(shallow.roots.every(r => r.children.length === 0)).toBe(true);
  expect(shallow.roots.find(r => r.key === 'Tanakh').count).toBe(tanakh.count);
});

test('path toggling keeps the selection a tree-antichain', () => {
  expect(togglePath([], 'Tanakh')).toEqual(['Tanakh']);
  expect(togglePath(['Tanakh'], 'Tanakh')).toEqual([]);
  expect(togglePath(['Tanakh/Torah', 'Talmud'], 'Tanakh')).toEqual(['Talmud', 'Tanakh']);
  expect(togglePath(['Tanakh'], 'Tanakh/Torah')).toEqual(['Tanakh/Torah']);
  expect(underPaths('Tanakh/Torah/Genesis', ['Tanakh'])).toBe(true);
  expect(underPaths('Tanakhx/Y', ['Tanakh'])).toBe(false);
  expect(underPaths('Anything', [])).toBe(true);
});

test('client filters, versions and CSV', () => {
  const results = collapseVersions(fixture.hits.hits).map(hitToResult);
  expect(applyClientFilters(results, { lang: 'he' })).toHaveLength(0);   // collapsed to the English primary
  expect(applyClientFilters(results, { era: 'rishonim' }).map(r => r.ref)).toEqual(['Rashi on Genesis 1:4:1', 'Zohar 1:15a:3', 'Mishneh Torah, Foundations of the Torah 2:1']);
  expect(applyClientFilters(results, { version: 'Zohar, translated by Daniel C. Matt' })).toHaveLength(1);
  expect(versionsIn(results)[0]).toEqual({ version: 'The Contemporary Torah, JPS, 2006', count: 1 });
  const csv = resultsToCsv(results.slice(0, 2));
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe('ref,heRef,path,version,lang,comp_date,snippet,url');
  expect(lines[1]).toContain('"The Contemporary Torah, JPS, 2006"');
  expect(lines[1]).toContain('https://www.sefaria.org/Genesis.1.3');
  expect(lines[1]).not.toContain('<b>');
  expect(stripTags('<b>a</b>  b')).toBe('a b');
});

test('totals from classic SearchTotal or raw ES', () => {
  expect(totalOf(fixture)).toEqual({ value: 2873, exact: true });
  expect(totalOf({ hits: { total: { getValue: () => 10, relation: 'gte' } } })).toEqual({ value: 10, exact: false });
  expect(totalOf({ hits: { total: 7 } })).toEqual({ value: 7, exact: true });
  expect(totalOf(null)).toEqual({ value: 0, exact: true });
});

test('grade tag is stable', () => {
  expect(gradeOf('Genesis 1:3')).toBe(gradeOf('Genesis 1:3'));
  expect(['elementary', 'middle', 'high']).toContain(gradeOf('Berakhot 2a'));
});
