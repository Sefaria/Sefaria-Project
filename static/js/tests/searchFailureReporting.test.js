/**
 * The two consumers of a failed search, tested against the real code.
 *
 *  1. ElasticSearchQuerier._handleError -- the sources query. Its signature changed from
 *     jQuery's three positional arguments to the single object execute_query now rejects
 *     with. searchQueryErrors.test.js pins the producing side of that contract; this pins
 *     the consuming side, so the two cannot drift apart silently.
 *
 *  2. SearchPage.fetchEntityResults -- the books/authors/topics queries. The token guard
 *     moved ahead of the analytics report so a superseded request can no longer report a
 *     failure that a newer, successful request is then unable to correct.
 *
 * Both are driven directly rather than through a render: the behaviour under test is
 * ordering and bookkeeping, not markup.
 */

jest.mock('../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    _: (k) => k,
    _bilingual: (s) => ({ en: s, he: s }),
    interfaceLang: 'english',
    apiHost: '',
    hebrew: { isHebrew: () => false },
    util: { clone: (x) => x },
    terms: {},
    _tocOrderLookup: {},
    toc: [],                                  // SearchPage's constructor maps over this
    search: { entitySearch: jest.fn() },
  },
}));

// Misc.jsx and ImageCropper.jsx are the only two modules in the tree that import a
// stylesheet, which Jest cannot parse. Stubbing them keeps this test free of any
// project-level Jest configuration. Every named export becomes a no-op component; nothing
// under test renders them.
// (factories must be inline -- jest hoists them above the imports)
jest.mock("../Misc", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));
jest.mock("../ImageCropper", () => new Proxy({}, {
  get: (_t, prop) => (prop === "__esModule" ? true : () => null),
}));

import Sefaria from '../sefaria/sefaria';
import SearchAnalytics from '../sefaria/searchAnalytics';
import { ElasticSearchQuerier } from '../ElasticSearchQuerier.jsx';
import SearchPage from '../SearchPage.jsx';

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('ElasticSearchQuerier._handleError', () => {
    // Called with a stub `this`, so this is the real method against a fake component.
    const run = (rejection) => {
        const self = { setState: jest.fn(), updateRunningQuery: jest.fn() };
        ElasticSearchQuerier.prototype._handleError.call(self, rejection);
        return self;
    };

    let recordApiResult;
    beforeEach(() => {
        recordApiResult = jest.spyOn(SearchAnalytics, 'recordApiResult').mockImplementation(() => {});
    });
    afterEach(() => recordApiResult.mockRestore());

    test('an abort reports nothing and shows no error state', () => {
        // The hot path: every new query aborts the one in flight. If this stopped matching,
        // the search page would flash its error state and log a false failure constantly.
        const self = run({ jqXHR: { status: 0 }, textStatus: 'abort', errorThrown: 'abort' });

        expect(recordApiResult).not.toHaveBeenCalled();
        expect(self.setState).not.toHaveBeenCalled();
        expect(self.updateRunningQuery).not.toHaveBeenCalled();
    });

    test('a server failure reports the cause and shows the error state', () => {
        const self = run({ jqXHR: { status: 500 }, textStatus: 'error', errorThrown: 'Internal Server Error' });

        expect(recordApiResult).toHaveBeenCalledWith('sources', null, 'Internal Server Error');
        expect(self.setState).toHaveBeenCalledWith({ error: true });
        expect(self.updateRunningQuery).toHaveBeenCalledWith(null);
    });

    test('falls back to textStatus when jQuery supplies no errorThrown', () => {
        run({ jqXHR: { status: 0 }, textStatus: 'timeout', errorThrown: undefined });

        expect(recordApiResult).toHaveBeenCalledWith('sources', null, 'timeout');
    });

    test('names a plain Error by its message rather than "unknown error"', () => {
        // A bug thrown inside the query rejects with an Error, not the {jqXHR, ...} bundle.
        run(new Error('sortedJSON blew up'));

        expect(recordApiResult).toHaveBeenCalledWith('sources', null, 'sortedJSON blew up');
    });

    test('survives a rejection with no value at all', () => {
        expect(() => run(undefined)).not.toThrow();
        expect(recordApiResult).toHaveBeenCalledWith('sources', null, 'unknown error');
    });
});

describe('SearchPage entity-fetch failures', () => {
    // Drive fetchEntityResults on a real SearchPage instance with setState stubbed out.
    const makePage = (query = 'moses') => {
        const page = new SearchPage({ query, compare: false, searchInBook: false });
        page.props = { query, compare: false, searchInBook: false };
        page.setState = jest.fn();
        page.selectedCategoryPaths = () => [];
        page.withCategoryCounts = (entityData) => ({ entityData });
        return page;
    };

    // entitySearch returns a promise the test settles by hand, so request ordering is exact.
    const deferred = () => {
        let resolve, reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    };

    let recordApiResult;
    beforeEach(() => {
        recordApiResult = jest.spyOn(SearchAnalytics, 'recordApiResult').mockImplementation(() => {});
        Sefaria.search.entitySearch.mockReset();
    });
    afterEach(() => recordApiResult.mockRestore());

    test('a failure on the current request is reported', () => {
        const page = makePage();
        const d = deferred();
        Sefaria.search.entitySearch.mockReturnValue(d.promise);

        page.fetchEntityResults(['book']);
        d.reject(new Error('boom'));

        return flush().then(() => {
            expect(recordApiResult).toHaveBeenCalledWith('books', null, 'boom');
        });
    });

    test('a superseded request\'s failure is NOT reported, so the newer success can land', async () => {
        // The race the reorder fixes: change a sort or filter while the query is still
        // completing, the first request fails, the second succeeds. recordApiResult counts
        // only the first report per API, so a stale failure would claim the slot and make
        // search_query_executed say 'failure' while the user looks at real results.
        const page = makePage();
        const first = deferred();
        const second = deferred();

        Sefaria.search.entitySearch.mockReturnValueOnce(first.promise);
        page.fetchEntityResults(['book']);          // request #1

        Sefaria.search.entitySearch.mockReturnValueOnce(second.promise);
        page.fetchEntityResults(['book']);          // request #2 supersedes it

        first.reject(new Error('network blip'));    // the stale one fails
        await flush();

        expect(recordApiResult).not.toHaveBeenCalled();

        second.resolve({ hits: [], total: 812 });   // the live one succeeds
        await flush();

        expect(recordApiResult).toHaveBeenCalledTimes(1);
        expect(recordApiResult).toHaveBeenCalledWith('books', 812);
    });

    test('a superseded request that fails still leaves the live request free to report a failure', async () => {
        // The dropped stale report cannot strand `pending`: whatever superseded it reports
        // in its own place, on success or on failure.
        const page = makePage();
        const first = deferred();
        const second = deferred();

        Sefaria.search.entitySearch.mockReturnValueOnce(first.promise);
        page.fetchEntityResults(['book']);
        Sefaria.search.entitySearch.mockReturnValueOnce(second.promise);
        page.fetchEntityResults(['book']);

        first.reject(new Error('stale failure'));
        second.reject(new Error('live failure'));
        await flush();

        expect(recordApiResult).toHaveBeenCalledTimes(1);
        expect(recordApiResult).toHaveBeenCalledWith('books', null, 'live failure');
    });

    test('a failure belonging to a previous query text is not reported against the new one', async () => {
        // The other kind of staleness, which the token guard alone does not catch: props.query
        // changes before resetEntityResults (a setState callback) has bumped the token.
        const page = makePage('moses');
        const d = deferred();
        Sefaria.search.entitySearch.mockReturnValue(d.promise);

        page.fetchEntityResults(['book']);
        page.props = { ...page.props, query: 'aaron' };   // user searched something else
        d.reject(new Error('late failure for moses'));
        await flush();

        expect(recordApiResult).not.toHaveBeenCalled();
    });
});
