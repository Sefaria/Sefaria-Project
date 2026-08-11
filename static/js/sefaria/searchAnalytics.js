/**
 * SearchAnalytics -- GA4 events for the search results page.
 *
 * Implements the four events of the search analytics spec (sc-46034):
 *   search_flow_started   -- user arrives at the search page; assigns a flow_id
 *   search_query_executed -- a query finishes, i.e. ALL FOUR search APIs have
 *                            returned (sources + books + authors + topics)
 *   search_element_clicked -- a tab, filter, or result was clicked
 *   search_flow_ended     -- user leaves the search page (clicked a result or
 *                            navigated away in-app)
 *
 * These events call gtag() directly (like templates/registration/register.html)
 * rather than going through analyticsEventTracker.js's data-anl-* attribute
 * system, because three of the four fire from code (API callbacks, navigation),
 * not from DOM events on elements.
 *
 * A "flow" is one visit to the search page. It starts when the search page
 * mounts and ends when the user navigates away. Coming back (e.g. browser back
 * button) mounts the page again and starts a NEW flow with a new flow_id.
 * Within a flow, each distinct query text gets its own search_id; filter and
 * sort changes do NOT create a new search_id (they are element clicks).
 *
 * All methods no-op when there is no active flow, so callers (which are shared
 * with the compare panel, sidebar search, and Voices search -- all out of
 * scope) can call in unconditionally.
 */

// The four API calls whose return "completes" a query. These keys are also the
// keys of the result_counts JSON sent with search_query_executed.
const QUERY_APIS = ['sources', 'books', 'authors', 'topics'];

const SearchAnalytics = {
    _flow: null,   // {flowId} -- set while the user is on the search page
    _query: null,  // {searchId, searchText, pending, counts, error, fired}

    // One-shot hint for the `source` field of the next search_flow_started.
    // Starts as 'deep_link': if the first flow starts with no one having set a
    // hint, the user landed on the search page directly (server-rendered).
    // ReaderApp sets 'nav_bar' (header search) or 'back_from_result' (browser
    // back into search) just before the search page mounts.
    _nextFlowSource: 'deep_link',

    setNextFlowSource: function(source) {
        this._nextFlowSource = source;
    },

    isFlowActive: function() {
        return !!this._flow;
    },

    startFlow: function() {
        // A remount without an explicit endFlow (shouldn't happen, but be safe)
        // just starts fresh; the old flow simply has no search_flow_ended.
        const source = this._nextFlowSource || 'unknown';
        this._nextFlowSource = null;  // one-shot: later flows need a new hint
        this._flow = { flowId: crypto.randomUUID() };
        this._query = null;
        this._fireEvent('search_flow_started', {
            flow_id: this._flow.flowId,
            source: source,
        });
    },

    /**
     * Called when a query with new text is kicked off. Resets the "which APIs
     * have we heard back from" bookkeeping. search_query_executed fires only
     * once all four APIs report in via recordApiResult; if the user refines
     * the query before that happens, the superseded query's event simply never
     * fires (per spec).
     */
    startQuery: function(searchText) {
        if (!this._flow) { return; }
        this._query = {
            searchId: crypto.randomUUID(),
            searchText: searchText,
            pending: new Set(QUERY_APIS),
            counts: {},
            error: null,
            fired: false,
        };
    },

    /**
     * One search API returned. `api` is one of QUERY_APIS. Pass `count` on
     * success, or `errorMessage` on failure (count is recorded as null).
     * Duplicate reports for the same API (e.g. the sources API re-runs when a
     * filter is applied) are ignored -- only the first response per query
     * counts toward completion.
     */
    recordApiResult: function(api, count, errorMessage) {
        const q = this._query;
        if (!this._flow || !q || q.fired || !q.pending.has(api)) { return; }
        q.pending.delete(api);
        if (errorMessage) {
            q.counts[api] = null;
            // Keep the first error; prefix with which API failed.
            if (!q.error) { q.error = `${api}: ${errorMessage}`; }
        } else {
            q.counts[api] = count;
        }
        if (q.pending.size === 0) {
            q.fired = true;
            this._fireEvent('search_query_executed', {
                flow_id: this._flow.flowId,
                search_id: q.searchId,
                search_text: q.searchText,
                status: q.error ? 'failure' : 'success',
                result_counts: JSON.stringify(q.counts),
                error: q.error || undefined,
            });
        }
    },

    /**
     * A tab, filter, or result was clicked.
     * elementType: 'tab' | 'filter' | 'result'
     * elementValue: tab/filter name, or the result's reference/title
     * count: result count shown on the tab/filter (omit for results)
     * resultPosition: 1-based rank of a clicked result (omit for tabs/filters)
     */
    elementClicked: function({elementType, elementValue, count, resultPosition}) {
        if (!this._flow) { return; }
        this._fireEvent('search_element_clicked', {
            flow_id: this._flow.flowId,
            search_id: this._query ? this._query.searchId : undefined,
            element_type: elementType,
            element_value: elementValue,
            count: (count === null || count === undefined) ? undefined : count,
            result_position: resultPosition || undefined,
        });
    },

    /**
     * A result was clicked. Fires the click event AND ends the flow with
     * reason 'clicked_result' -- clicking a result is a "true exit" from
     * search. Called by SearchResultCard, which navigates in ways that bypass
     * ReaderApp's link handling (onResultClick / window.location.href).
     */
    resultClicked: function(elementValue, resultPosition) {
        if (!this._flow) { return; }
        this.elementClicked({elementType: 'result', elementValue, resultPosition});
        this.endFlow('clicked_result');
    },

    /**
     * The user left the search page. reason: 'clicked_result' | 'abandoned'.
     * Safe to call from generic navigation code -- no-ops unless a flow is
     * active, and a flow can only end once.
     */
    endFlow: function(reason) {
        if (!this._flow) { return; }
        this._fireEvent('search_flow_ended', {
            flow_id: this._flow.flowId,
            search_id: this._query ? this._query.searchId : undefined,
            reason: reason,
        });
        this._flow = null;
        this._query = null;
    },

    /**
     * Send one event to GA4. `transport_type: 'beacon'` forces immediate
     * per-event dispatch: search_flow_ended and result clicks fire right
     * before navigation, and GA's default XHR transport would drop them.
     * gtag can be undefined (ad blockers, local dev without GOOGLE_GTAG) --
     * events are silently skipped. Fields with undefined values are omitted
     * so GA4/BigQuery only sees params that actually have a value.
     */
    _fireEvent: function(name, fields) {
        if (typeof gtag !== 'function') { return; }
        const params = { transport_type: 'beacon' };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) { params[key] = value; }
        }
        gtag('event', name, params);
    },
};

export default SearchAnalytics;
