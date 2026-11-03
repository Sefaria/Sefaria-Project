/**
 * Sefaria.search.execute_query error plumbing.
 *
 * These cover the change that made execute_query actually invoke `args.error`. Before it,
 * `args.error` was never called on any path, which meant ElasticSearchQuerier._handleError
 * was effectively dead code -- so every case below is a code path that had never run in
 * production before. The abort case in particular is the hottest path in search: every new
 * query aborts the one in flight, so a mistake there would put the search page into its red
 * error state on essentially every keystroke.
 *
 * $.ajax is mocked so a test can settle a request as success, failure, or abort on demand.
 */

jest.mock('../sefariaJquery', () => ({ __esModule: true, default: { ajax: jest.fn() } }));
// search.js -> searchState.js -> util.js -> sefaria.js, and sefaria.js runs Sefaria.setup()
// at import time, which needs a browser and Django-injected globals. None of that is
// involved in what these tests exercise, so the module is stubbed out.
jest.mock('../sefaria', () => ({ __esModule: true, default: {} }));

import $ from '../sefariaJquery';
import Search from '../search';

// Lets a test await the microtask queue so the promise chain inside execute_query settles.
const flush = () => new Promise(resolve => setImmediate(resolve));

const realSefaria = global.Sefaria;
beforeAll(() => {
    global.Sefaria = {
        apiHost: '',
        // English query => isDictaQuery() is false => the plain single-request branch, which
        // is the one every non-Hebrew search takes.
        hebrew: { isHebrew: () => false },
        util: { clone: (x) => x },   // used by _cacheQuery on the success path
    };
});
afterAll(() => { global.Sefaria = realSefaria; });

beforeEach(() => {
    $.ajax.mockReset();
    // wrapper.addQuery() stores whatever $.ajax returns and calls .abort() on it, so the
    // fake jqXHR needs that method.
    $.ajax.mockImplementation(() => ({ abort: jest.fn() }));
});

const makeArgs = (over = {}) => ({
    query: 'moses',
    type: 'text',
    applied_filters: [],
    appliedFilterAggTypes: [],
    aggregationsToUpdate: [],
    size: 10,
    start: 0,
    field: 'naive_lemmatizer',
    sort_type: 'relevance',
    exact: false,
    success: jest.fn(),
    error: jest.fn(),
    ...over,
});

// Run a query and hand back the $.ajax options object, so the test can settle the request.
const runQuery = (args) => {
    new Search('text', 'sheet').execute_query(args);
    return $.ajax.mock.calls[0][0];
};

const okResponse = () => ({ hits: { hits: [], total: { value: 7, relation: 'eq' } } });

describe('a successful query', () => {
    test('calls success and never calls error', async () => {
        const args = makeArgs();
        runQuery(args).success(okResponse());
        await flush();

        expect(args.success).toHaveBeenCalledTimes(1);
        expect(args.error).not.toHaveBeenCalled();
    });
});

describe('a failed query', () => {
    test('calls error -- the regression this whole change exists to fix', async () => {
        const args = makeArgs();
        const jqXHR = { status: 500, statusText: 'Internal Server Error' };
        runQuery(args).error(jqXHR, 'error', 'Internal Server Error');
        await flush();

        // Before the fix this was 0: execute_query had no rejection handler at all, so a
        // failed sources query left 'sources' pending forever and search_query_executed
        // never fired.
        expect(args.error).toHaveBeenCalledTimes(1);
        expect(args.success).not.toHaveBeenCalled();
    });

    test('passes one object carrying all three of jQuery\'s error arguments', async () => {
        const args = makeArgs();
        const jqXHR = { status: 500, statusText: 'Internal Server Error' };
        runQuery(args).error(jqXHR, 'error', 'Internal Server Error');
        await flush();

        // A Promise rejects with a single value, so the three are bundled. This is the
        // contract ElasticSearchQuerier._handleError destructures -- see its own test.
        expect(args.error).toHaveBeenCalledWith({
            jqXHR,
            textStatus: 'error',
            errorThrown: 'Internal Server Error',
        });
    });

    test.each([
        ['timeout', 'timeout', 'timeout'],
        ['parsererror', 'parsererror', 'Unexpected token < in JSON'],
    ])('preserves jQuery\'s real cause for a %s', async (_label, textStatus, errorThrown) => {
        const args = makeArgs();
        runQuery(args).error({ status: 0 }, textStatus, errorThrown);
        await flush();

        // Deriving these from jqXHR.statusText instead would flatten timeout and
        // parsererror into the HTTP status text, misreporting the cause to analytics.
        expect(args.error.mock.calls[0][0]).toMatchObject({ textStatus, errorThrown });
    });
});

describe('an aborted query', () => {
    // Every new text query calls queryAborter.abort() on the previous one, so this fires
    // constantly in normal use. _handleError keys off textStatus === 'abort' to stay silent;
    // if that string stopped arriving, every search would flash an error state and record a
    // false failure.
    test('reports textStatus \'abort\', which is what _handleError checks for', async () => {
        const args = makeArgs();
        runQuery(args).error({ status: 0, statusText: 'abort' }, 'abort', 'abort');
        await flush();

        expect(args.error).toHaveBeenCalledTimes(1);
        expect(args.error.mock.calls[0][0].textStatus).toBe('abort');
    });
});

describe('an exception thrown by args.success', () => {
    test('is NOT reported as a search failure', async () => {
        // args.error is wired as .then()'s second argument rather than a trailing .catch()
        // precisely so this cannot happen: args.success triggers a React render, and a
        // render bug must not be recorded in GA4 as a failed search.
        const boom = new Error('render blew up');
        const args = makeArgs({ success: jest.fn(() => { throw boom; }) });
        // eslint-disable-next-line no-console
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        runQuery(args).success(okResponse());
        await flush();

        expect(args.success).toHaveBeenCalledTimes(1);
        expect(args.error).not.toHaveBeenCalled();   // the point of the test
        expect(logSpy).toHaveBeenCalledWith(boom);   // swallowed by the trailing .catch()
        logSpy.mockRestore();
    });
});

describe('a caller that supplies no error callback', () => {
    test('does not throw -- .then(fn, undefined) falls through to the trailing .catch()', async () => {
        // execute_query documents `error` as optional, and this replaced an explicit
        // `if (args.error)` guard, so the fallback is worth pinning down.
        const args = makeArgs({ error: undefined });
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        expect(() => {
            runQuery(args).error({ status: 500 }, 'error', 'Internal Server Error');
        }).not.toThrow();
        await flush();

        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();
    });
});
