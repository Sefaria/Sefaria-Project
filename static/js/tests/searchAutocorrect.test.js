/**
 * Search.autocorrectQuery and Search.entitySearch's use of it. Sefaria._cachedApiPromise is
 * stubbed with a url -> response map on the global Sefaria, which is how search.js reaches it.
 */
// The real module boots the whole app on import; search.js only needs the global at call time.
jest.mock('../sefaria/sefaria', () => ({__esModule: true, default: {}}));
jest.mock('../sefaria/sefariaJquery', () => ({__esModule: true, default: {}}));

import Search from '../sefaria/search';

const NONE = {corrected_query: null, suggested_queries: null};

function setup(responses) {
  const requested = [];
  global.Sefaria = {
    apiHost: '',
    _cachedApiPromise: jest.fn(({url, key, store}) => {
      requested.push(url);
      if (!(url in responses)) { return Promise.reject(new Error(`unexpected ${url}`)); }
      if (store[key] === undefined) { store[key] = responses[url]; }
      return Promise.resolve(store[key]);
    }),
  };
  return {search: new Search(), requested};
}

describe('Search.autocorrectQuery', () => {
  test('returns the endpoint answer and caches it for synchronous lookup', async () => {
    const answer = {corrected_query: 'bereishit rabbah', suggested_queries: null};
    const {search} = setup({'/api/search-autocorrect?q=bereshit%20rabbah': answer});
    expect(search.getCachedAutocorrect('bereshit rabbah')).toBeUndefined();
    expect(await search.autocorrectQuery('bereshit rabbah')).toEqual(answer);
    expect(search.getCachedAutocorrect('bereshit rabbah')).toEqual(answer);
  });

  test('fails open: a failed lookup means no correction, and is not cached', async () => {
    const {search} = setup({});
    expect(await search.autocorrectQuery('cat')).toEqual(NONE);
    expect(search.getCachedAutocorrect('cat')).toBeUndefined();
  });

  test('an error body means no correction, and is evicted from the cache', async () => {
    const {search} = setup({'/api/search-autocorrect?q=cat': {error: 'boom'}});
    expect(await search.autocorrectQuery('cat')).toEqual(NONE);
    expect(search.getCachedAutocorrect('cat')).toBeUndefined();
  });

  test('an empty query skips the request', async () => {
    const {search, requested} = setup({});
    expect(await search.autocorrectQuery('')).toEqual(NONE);
    expect(requested).toEqual([]);
  });
});

describe('Search.entitySearch', () => {
  const entityUrl = q => `/api/entity-search?q=${q}&type=book&start=0&sort=relevance`;

  test('searches the corrected query', async () => {
    const {search, requested} = setup({
      '/api/search-autocorrect?q=bereshit': {corrected_query: 'bereishit', suggested_queries: null},
      [entityUrl('bereishit')]: {hits: [], total: 0},
    });
    await search.entitySearch('bereshit', 'book');
    expect(requested[requested.length - 1]).toBe(entityUrl('bereishit'));
  });

  test('searches the query as typed when only suggestions come back', async () => {
    const {search, requested} = setup({
      '/api/search-autocorrect?q=cat': {corrected_query: null, suggested_queries: ['cap', 'cot']},
      [entityUrl('cat')]: {hits: [], total: 0},
    });
    await search.entitySearch('cat', 'book');
    expect(requested[requested.length - 1]).toBe(entityUrl('cat'));
  });

  test('disableAutocorrect skips the lookup entirely', async () => {
    const {search, requested} = setup({[entityUrl('bereshit')]: {hits: [], total: 0}});
    await search.entitySearch('bereshit', 'book', 0, {disableAutocorrect: true});
    expect(requested).toEqual([entityUrl('bereshit')]);
  });

  test('still searches the typed query when the lookup fails', async () => {
    const {search, requested} = setup({[entityUrl('bereshit')]: {hits: [], total: 0}});
    await search.entitySearch('bereshit', 'book');
    expect(requested[requested.length - 1]).toBe(entityUrl('bereshit'));
  });
});
