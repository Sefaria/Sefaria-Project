/**
 * Search.autocorrectQuery, Search.decideAutocorrect and Search.entitySearch. Sefaria._cachedApiPromise is
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
  test('returns the endpoint answer, asking only once per query', async () => {
    const answer = {corrected_query: 'bereishit rabbah', suggested_queries: null};
    const {search, requested} = setup({'/api/search-autocorrect?q=bereshit%20rabbah': answer});
    expect(await search.autocorrectQuery('bereshit rabbah')).toEqual(answer);
    expect(await search.autocorrectQuery('bereshit rabbah')).toEqual(answer);
    expect(requested).toHaveLength(2);  // both reach _cachedApiPromise, which owns the cache
    expect(Object.keys(search._cache)).toEqual(['autocorrect|bereshit rabbah']);
  });

  test('fails open: a failed lookup means no correction, and is not cached', async () => {
    const {search} = setup({});
    expect(await search.autocorrectQuery('cat')).toEqual(NONE);
    expect(search._cache).toEqual({});
  });

  test('an error body means no correction, and is evicted from the cache', async () => {
    const {search} = setup({'/api/search-autocorrect?q=cat': {error: 'boom'}});
    expect(await search.autocorrectQuery('cat')).toEqual(NONE);
    expect(search._cache).toEqual({});
  });

  test('an empty query skips the request', async () => {
    const {search, requested} = setup({});
    expect(await search.autocorrectQuery('')).toEqual(NONE);
    expect(requested).toEqual([]);
  });
});

describe('Search.decideAutocorrect', () => {
  const url = q => `/api/search-autocorrect?q=${q}`;
  const single = {corrected_query: 'bereishit', suggested_queries: null};
  const many = {corrected_query: null, suggested_queries: ['cap', 'cot']};
  const counts = (...results) => jest.fn(() => results.map(r => r instanceof Error ? Promise.reject(r) : Promise.resolve(r)));

  test('corrects only when every tab finds nothing', async () => {
    const {search} = setup({[url('bereshit')]: single});
    expect(await search.decideAutocorrect('bereshit', counts(0, 0, 0, 0))).toEqual(single);
  });

  test('searches as typed when any tab finds something, and never asks again', async () => {
    const {search} = setup({[url('bereshit')]: single});
    const countResults = counts(0, 0, 1, 0);
    expect(await search.decideAutocorrect('bereshit', countResults)).toEqual(NONE);
    expect(await search.decideAutocorrect('bereshit', countResults)).toEqual(NONE);
    expect(countResults).toHaveBeenCalledTimes(1);
    expect(search.getCachedDecision('bereshit')).toEqual(NONE);
  });

  test('a positive count decides without waiting for the other tabs', async () => {
    const {search} = setup({[url('bereshit')]: single});
    const never = new Promise(() => {});
    expect(await search.decideAutocorrect('bereshit', () => [never, Promise.resolve(3)])).toEqual(NONE);
  });

  test('a failed count means no correction, and is not cached', async () => {
    const {search} = setup({[url('bereshit')]: single});
    expect(await search.decideAutocorrect('bereshit', counts(0, new Error('500'), 0))).toEqual(NONE);
    expect(search.getCachedDecision('bereshit')).toBeUndefined();
    expect(await search.decideAutocorrect('bereshit', counts(0, 0, 0))).toEqual(single);  // retried
  });

  test('a count that is not a number means no correction', async () => {
    const {search} = setup({[url('bereshit')]: single});
    expect(await search.decideAutocorrect('bereshit', counts(0, undefined))).toEqual(NONE);
  });

  test('suggestions pass through without counting anything', async () => {
    const {search} = setup({[url('cat')]: many});
    const countResults = counts(0);
    expect(await search.decideAutocorrect('cat', countResults)).toEqual(many);
    expect(countResults).not.toHaveBeenCalled();
    expect(search.getCachedDecision('cat')).toEqual(many);
  });

  test('no suggestion means as typed, without counting anything', async () => {
    const {search} = setup({[url('cat')]: NONE});
    const countResults = counts(0);
    expect(await search.decideAutocorrect('cat', countResults)).toEqual(NONE);
    expect(countResults).not.toHaveBeenCalled();
  });

  test('a failed lookup means as typed, and is not cached', async () => {
    const {search} = setup({});
    expect(await search.decideAutocorrect('cat', counts(0))).toEqual(NONE);
    expect(search.getCachedDecision('cat')).toBeUndefined();
  });

  test('counts that throw outright mean as typed', async () => {
    const {search} = setup({[url('bereshit')]: single});
    expect(await search.decideAutocorrect('bereshit', () => { throw new Error('boom'); })).toEqual(NONE);
    expect(search.getCachedDecision('bereshit')).toBeUndefined();
  });

  test('an empty query skips everything', async () => {
    const {search, requested} = setup({});
    expect(await search.decideAutocorrect('', counts(0))).toEqual(NONE);
    expect(requested).toEqual([]);
  });
});

describe('Search.entitySearch', () => {
  const entityUrl = q => `/api/entity-search?q=${q}&type=book&start=0&sort=relevance`;

  test('searches the text it is given, without consulting autocorrect', async () => {
    const {search, requested} = setup({[entityUrl('bereshit')]: {hits: [], total: 0}});
    await search.entitySearch('bereshit', 'book');
    expect(requested).toEqual([entityUrl('bereshit')]);
  });
});
