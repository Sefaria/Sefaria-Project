/**
 * SearchAnalytics -- GA4 events for the search results page.
 *
 * Implements the four events of the search analytics spec (sc-46034):
 *   search_flow_started   -- user arrives at the search page; assigns a flow_id
 *   search_query_executed -- a query finishes, i.e. ALL FOUR search APIs have
 *                            returned (sources + books + authors + topics)
 *   search_element_clicked -- a tab, filter, or result was clicked. "Result"
 *                            covers the card itself and every link inside it:
 *                            title, version row, breadcrumb category, author.
 *   search_flow_ended     -- user leaves the search page (clicked a result or
 *                            navigated away in-app). Opening a result in a NEW
 *                            TAB is a click but not an exit -- the user is
 *                            still on the search page, so the flow continues.
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

// Attributes a search result card stamps onto every link inside it, naming the
// result that link belongs to. Only read on the modified-click path, where the
// card's own onClick never runs -- see reportModifiedResultLinkClick.
const RESULT_VALUE_ATTR = 'data-search-result-value';
const RESULT_POSITION_ATTR = 'data-search-result-position';

/**
 * Build those attributes for one link, to be spread onto an <a>. Returns an
 * empty object when the card is not opted into analytics (no position), so the
 * attributes never appear on compare-panel or sidebar-search cards.
 */
export const resultLinkAnalyticsAttrs = (elementValue, resultPosition) => (
    resultPosition
        ? {[RESULT_VALUE_ATTR]: elementValue, [RESULT_POSITION_ATTR]: resultPosition}
        : {}
);

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
     * A result was clicked -- either the card itself or any link inside it:
     * the title, a version row, a breadcrumb category, or the author name.
     * They all report as element_type 'result'.
     *
     * `endsFlow` is true for a click that navigates the current window, which
     * is a "true exit" from search. Pass false when the click opens a new tab
     * or window: the user is still sitting on the search page, so the flow has
     * not ended and their later clicks must keep reporting.
     *
     * Called by SearchResultCard, which navigates in ways that bypass
     * ReaderApp's link handling (onResultClick / window.location.href, and
     * crumbs that stop propagation).
     */
    resultClicked: function(elementValue, resultPosition, endsFlow = true) {
        if (!this._flow) { return; }
        this.elementClicked({elementType: 'result', elementValue, resultPosition});
        if (endsFlow) { this.endFlow('clicked_result'); }
    },

    /**
     * A modified click (Cmd/Ctrl/Shift/Alt) on a link inside a result card,
     * reported from ReaderApp rather than from the card itself.
     *
     * It has to come from there: ReaderApp listens for clicks on `document` in
     * the CAPTURE phase and calls stopImmediatePropagation() on any modified
     * click (handleInAppClickWithModifiers). That stops the event before it
     * reaches the link, and before React 16's delegated bubble-phase listener
     * on `document` -- which is where every onClick in the app actually runs.
     * So no React handler in the card ever sees these clicks; the card instead
     * publishes what it would have reported as data-search-result-* attributes,
     * and this reads them back off the clicked link.
     *
     * The flow is deliberately not ended: the result opens in a new tab and the
     * user stays on the search page.
     */
    reportModifiedResultLinkClick: function(linkEl) {
        if (!this._flow || !linkEl?.closest) { return; }
        const el = linkEl.closest(`[${RESULT_VALUE_ATTR}]`);
        if (!el) { return; }
        this.resultClicked(
            el.getAttribute(RESULT_VALUE_ATTR),
            Number(el.getAttribute(RESULT_POSITION_ATTR)) || undefined,
            false,  // new tab -- the visit to the search page is still going
        );
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
