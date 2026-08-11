import SearchAnalytics from '../searchAnalytics';

// The module reads the global `gtag` (GA4) and `crypto.randomUUID` at call
// time, so both are replaced with deterministic mocks.
let uuidCounter;

beforeEach(() => {
    uuidCounter = 0;
    global.gtag = jest.fn();
    global.crypto = { randomUUID: () => `uuid-${uuidCounter++}` };
    // Reset the singleton's state between tests.
    SearchAnalytics._flow = null;
    SearchAnalytics._query = null;
    SearchAnalytics._nextFlowSource = 'deep_link';
});

// gtag is called as gtag('event', name, params); return [name, params] pairs.
const firedEvents = () => global.gtag.mock.calls.map(([, name, params]) => [name, params]);

const reportAllApis = (counts = {sources: 933, books: 31, authors: 1, topics: 2}) => {
    Object.entries(counts).forEach(([api, count]) => SearchAnalytics.recordApiResult(api, count));
};

describe('search_flow_started', () => {
    test('fires with a flow_id and the default deep_link source', () => {
        SearchAnalytics.startFlow();
        expect(firedEvents()).toEqual([
            ['search_flow_started', {transport_type: 'beacon', flow_id: 'uuid-0', source: 'deep_link'}],
        ]);
    });

    test('uses the one-shot source hint, then falls back to unknown', () => {
        SearchAnalytics.setNextFlowSource('nav_bar');
        SearchAnalytics.startFlow();
        SearchAnalytics.startFlow();  // no new hint set
        const sources = firedEvents().map(([, params]) => params.source);
        expect(sources).toEqual(['nav_bar', 'unknown']);
    });
});

describe('search_query_executed', () => {
    test('fires only once all four APIs have reported', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('mishna berachot');
        SearchAnalytics.recordApiResult('sources', 933);
        SearchAnalytics.recordApiResult('books', 31);
        SearchAnalytics.recordApiResult('authors', 1);
        expect(firedEvents().map(([name]) => name)).toEqual(['search_flow_started']);

        SearchAnalytics.recordApiResult('topics', 2);
        expect(firedEvents()[1]).toEqual(['search_query_executed', {
            transport_type: 'beacon',
            flow_id: 'uuid-0',
            search_id: 'uuid-1',
            search_text: 'mishna berachot',
            status: 'success',
            result_counts: JSON.stringify({sources: 933, books: 31, authors: 1, topics: 2}),
        }]);
    });

    test('ignores duplicate reports from the same API (filter re-runs)', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('rashi');
        SearchAnalytics.recordApiResult('sources', 10);
        SearchAnalytics.recordApiResult('sources', 999);  // re-run; must not count or overwrite
        SearchAnalytics.recordApiResult('books', 1);
        SearchAnalytics.recordApiResult('authors', 1);
        SearchAnalytics.recordApiResult('topics', 1);
        const [, params] = firedEvents()[1];
        expect(JSON.parse(params.result_counts).sources).toBe(10);
        expect(firedEvents().length).toBe(2);  // started + executed, no extra event from the re-run
    });

    test('an API error yields status failure, a null count, and the error reason', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('moshe');
        SearchAnalytics.recordApiResult('sources', 5);
        SearchAnalytics.recordApiResult('books', null, 'HTTP 500');
        SearchAnalytics.recordApiResult('authors', 1);
        SearchAnalytics.recordApiResult('topics', 1);
        const [, params] = firedEvents()[1];
        expect(params.status).toBe('failure');
        expect(params.error).toBe('books: HTTP 500');
        expect(JSON.parse(params.result_counts)).toEqual({sources: 5, books: null, authors: 1, topics: 1});
    });

    test('a refined query gets a new search_id; the superseded query never fires', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('first');
        SearchAnalytics.recordApiResult('sources', 1);  // only 1 of 4 returned
        SearchAnalytics.startQuery('second');           // user refined before completion
        reportAllApis();
        const executed = firedEvents().filter(([name]) => name === 'search_query_executed');
        expect(executed.length).toBe(1);
        expect(executed[0][1].search_text).toBe('second');
        expect(executed[0][1].flow_id).toBe('uuid-0');       // same flow
        expect(executed[0][1].search_id).toBe('uuid-2');     // new search_id
    });
});

describe('search_element_clicked', () => {
    test('tab/filter clicks carry count but no result_position', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('q');
        SearchAnalytics.elementClicked({elementType: 'tab', elementValue: 'Books', count: 31});
        const [name, params] = firedEvents()[1];
        expect(name).toBe('search_element_clicked');
        expect(params).toEqual({
            transport_type: 'beacon',
            flow_id: 'uuid-0',
            search_id: 'uuid-1',
            element_type: 'tab',
            element_value: 'Books',
            count: 31,
        });
        expect(params.result_position).toBeUndefined();
    });

    test('no-ops when no flow is active (compare panel, sidebar search)', () => {
        SearchAnalytics.elementClicked({elementType: 'filter', elementValue: 'Talmud', count: 42});
        expect(global.gtag).not.toHaveBeenCalled();
    });
});

describe('search_flow_ended', () => {
    test('resultClicked fires the click event and ends the flow with clicked_result', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('q');
        SearchAnalytics.resultClicked('Genesis 44:1', 3);
        const names = firedEvents().map(([name]) => name);
        expect(names).toEqual(['search_flow_started', 'search_element_clicked', 'search_flow_ended']);
        const click = firedEvents()[1][1];
        expect(click.element_type).toBe('result');
        expect(click.element_value).toBe('Genesis 44:1');
        expect(click.result_position).toBe(3);
        expect(click.count).toBeUndefined();
        expect(firedEvents()[2][1].reason).toBe('clicked_result');
    });

    test('a flow ends at most once', () => {
        SearchAnalytics.startFlow();
        SearchAnalytics.endFlow('abandoned');
        SearchAnalytics.endFlow('abandoned');  // e.g. a second navigation handler
        const ended = firedEvents().filter(([name]) => name === 'search_flow_ended');
        expect(ended.length).toBe(1);
    });
});

test('all events are skipped silently when gtag is unavailable (ad blocker)', () => {
    delete global.gtag;
    expect(() => {
        SearchAnalytics.startFlow();
        SearchAnalytics.startQuery('q');
        reportAllApis();
        SearchAnalytics.endFlow('abandoned');
    }).not.toThrow();
});
