import Component from "react-class";
import {SearchTotal} from "./sefaria/searchTotal";
import Sefaria from "./sefaria/sefaria";
import $ from "./sefaria/sefariaJquery";
import ReactDOM from "react-dom";
import SearchState from "./sefaria/searchState";
import extend from "extend";
import SearchTextResult from "./SearchTextResult";
import SearchSheetResult from "./SearchSheetResult";
import {LoadingMessage} from "./Misc";
import PropTypes from "prop-types";
import React from "react";
import {SearchResultList} from "./SearchResultList";
import SearchPage, {ALL_TAB_IDS, ENTITY_TYPES} from "./SearchPage";
import SearchInVoicesPage from "./SearchInVoicesPage";
import SearchAnalytics from "./sefaria/searchAnalytics";

class TopicQuerier {
    async addCollection(collection) {
        const d = await Sefaria.getCollection(collection.key);
        return {
            analyticCat: "Collection",
            title: d.name,
            heTitle: d.name,
            url: "/collections/" + collection.key,
            topicCat: "Collections",
            heTopicCat: Sefaria.hebrewTranslation("common.collections"),
            enDesc: d.description,
            heDesc: d.description,
            numSheets: d.sheets.length
        };
    }
    async addRefTopic(topic) {
        const book = await Sefaria.getIndexDetails(topic.key);
        return {
            enDesc: book.enDesc || book.enShortDesc,
            heDesc: book.heDesc || book.heShortDesc,
            title: book.title,
            heTitle: book.heTitle,
            topicCat: book.categories[0],
            heTopicCat: Sefaria.toc.filter(cat => cat.category === book.categories[0])[0].heCategory,
            url: "/" + book.title,
            analyticCat: "Book"
        }
    }
    addTOCCategoryTopic(topic) {
        const topicKeyArr = topic.key.slice();
        const lastCat = topicKeyArr.pop(topicKeyArr - 1); //go up one level in order to get the bottom level's description
        const relevantCats = topicKeyArr.length === 0 ? Sefaria.toc : Sefaria.tocItemsByCategories(topicKeyArr);
        const relevantSubCat = relevantCats.filter(cat => "category" in cat && cat.category === lastCat)[0];
        return {
            analyticCat: "Category",
            url: "/texts/" + topic.key.join("/"),
            topicCat: "Texts",
            heTopicCat: Sefaria.hebrewTerm("Texts"),
            enDesc: relevantSubCat.enDesc,
            heDesc: relevantSubCat.heDesc,
            title: relevantSubCat.category,
            heTitle: relevantSubCat.heCategory
        }
    }
    async addGeneralTopic(topic) {
        const d = await Sefaria.getTopic(topic.key, {annotated: false});
        let searchTopic = {
            analyticCat: "Topic",
            title: d.primaryTitle["en"],
            heTitle: d.primaryTitle["he"],
            numSources: 0,
            numSheets: 0,
            url: "/topics/" + topic.key
        }
        const typeObj = Sefaria.displayTopicTocCategory(topic.key);
        if (!typeObj) {
            searchTopic.topicCat = "Topics";
            searchTopic.heTopicCat = Sefaria.hebrewTranslation("common.topics");
        } else {
            searchTopic.topicCat = typeObj["en"];
            searchTopic.heTopicCat = typeObj["he"];
        }
        if ("description" in d) {
            searchTopic.enDesc = d.description["en"];
            searchTopic.heDesc = d.description["he"];
        }
        if (d.tabs?.sources) {
            searchTopic.numSources = d.tabs.sources.refs.length;
        }
        if (d.tabs?.sheets) {
            searchTopic.numSheets = d.tabs.sheets.refs.length;
        }
        return searchTopic;
    }
}

class ElasticSearchQuerier extends Component {
    constructor(props) {
      super(props);
      this.querySize = {"text": 100, "sheet": 20};
      this.state = {
        runningQueries: null,
        isQueryRunning: false,
        moreToLoad:     true,
        totals:         new SearchTotal(),
        // The searched text `totals` was counted for; null while `totals` is the empty placeholder.
        totalsFor:      null,
        pagesLoaded:    0,
        hits:           [],
        error:          false,
        topics:         [],
        // From Sefaria.search.decideAutocorrect (at most one is set). When correctedQuery is
        // set, it is what gets searched. Nothing renders until autocorrectResolved, since the
        // answer decides which text the results are for.
        correctedQuery: null,
        suggestedQueries: null,
        autocorrectResolved: false,
        // "Search instead for <query>" normally lives in panel state (the `disableAutocorrect`
        // prop, so it's in the URL). Callers without a panel, like the sidebar's search-in-book,
        // pass no onDisableAutocorrect and the click is kept here until the query changes.
        localDisableAutocorrect: false,
      }

      // Load search results from cache so they are available for immediate render. The cache
      // is keyed by the text actually searched, so apply an already-made decision first.
      Object.assign(this.state, this._autocorrectStateFor(props, this.state));
      const args = this._getQueryArgs(props);
      let hits = [];
      let totals = new SearchTotal();
      let totalsFor = null;
      let pagesLoaded = 0;
      let cachedQuery = Sefaria.search.getCachedQuery(args);
      while (cachedQuery) {
          // Load all pages of results that are available in cache, so if page X was
          // previously loaded it will be returned.
          //console.log("Loaded cached query for")
          //console.log(args);
          hits = hits.concat(cachedQuery.hits.hits);
          totals = cachedQuery.hits.total;
          // Only final once the correction is known.
          if (this.state.autocorrectResolved) { totalsFor = args.query; }
          pagesLoaded += 1;
          args.start = pagesLoaded * this.querySize[this.props.searchState.type];
          if (this.props.searchState.type === "text") {
            // Since texts only have one filter type, aggregations are only requested once on first page
            args.aggregationsToUpdate = [];
          }
          cachedQuery = Sefaria.search.getCachedQuery(args);
      }

      Object.assign(this.state, {
        // With nothing cached, the query componentDidMount is about to start counts as running
        // already. Otherwise the first render reads the empty starting totals as "0 results" and
        // flashes NoSearchResults (which also relabels the Library Assistant's Ask button).
        isQueryRunning: !!props.query && pagesLoaded === 0,
        totals,
        totalsFor,
        pagesLoaded,
        hits,
      });
    }
    componentDidMount() {
        // Search analytics (sc-46034) cover the main search page only -- not
        // the compare panel, sidebar search-in-book, or the Voices module.
        // Mounting this component IS "arriving at the search page", so the
        // flow starts here; SearchAnalytics no-ops everywhere else because no
        // flow was ever started.
        if (this._searchAnalyticsInScope()) {
            SearchAnalytics.startFlow();
            SearchAnalytics.startQuery(this.props.query);
            this._attachPageTransitionListeners();
        }
        this._executeAllQueries();
    }

    /**
     * React lifecycle only sees navigation that happens *inside* the app. Leaving
     * by a real page load -- an external link, typing a URL, closing the tab --
     * destroys the document without ever unmounting React, and coming back can
     * resurrect that same document without running any script at all. Neither
     * shows up as a mount or an unmount, so both need a browser-level listener.
     * (Same approach as the signup funnel, see auth/useSignUpTracking.js.)
     */
    _attachPageTransitionListeners() {
        // Fires whether the document is being discarded or frozen into the
        // back-forward cache, and it is the last point at which an event can still
        // be sent. Ends the flow that componentWillUnmount would otherwise have
        // ended. A result click already ended the flow with 'clicked_result', and a
        // flow can only end once, so this only ever reports genuine abandonment.
        this._onPageHide = () => SearchAnalytics.endFlow('abandoned');

        // persisted:true means the browser restored THIS document from the
        // back-forward cache. Nothing re-runs: React does not remount, so
        // componentDidMount never fires again and the flow ended at pagehide stays
        // ended -- leaving the user looking at the search page with no active flow,
        // where every later click reports nothing. Start a fresh flow instead.
        //
        // Note the results on screen are the ones the browser froze; no API is
        // re-run, so this visit has no search_query_executed. Clicks still carry a
        // search_id, so they remain attributable to the query that produced them.
        this._onPageShow = (e) => {
            if (!e.persisted) { return; }
            SearchAnalytics.setNextFlowSource('back_click');
            SearchAnalytics.startFlow();
            SearchAnalytics.startQuery(this.props.query);
        };

        window.addEventListener('pagehide', this._onPageHide);
        window.addEventListener('pageshow', this._onPageShow);
    }

    _detachPageTransitionListeners() {
        if (this._onPageHide) { window.removeEventListener('pagehide', this._onPageHide); }
        if (this._onPageShow) { window.removeEventListener('pageshow', this._onPageShow); }
        this._onPageHide = null;
        this._onPageShow = null;
    }
    componentWillUnmount() {
        // Unmounting IS "leaving the search page", and it is the one signal that catches every
        // in-app exit: the browser back button out of search (handlePopState swaps the panel
        // but calls nothing), closing the panel, or switching to another menu. Reason
        // 'abandoned' is correct here because a result click already ended the flow with
        // 'clicked_result' before navigating, and a flow can only end once.
        // Leaving the browser entirely -- closing the tab, reloading, or typing a new URL --
        // destroys the page without unmounting React, so it never reaches here; the `pagehide`
        // listener attached on mount covers those.
        if (this._searchAnalyticsInScope()) {
            SearchAnalytics.endFlow('abandoned');
            this._detachPageTransitionListeners();
        }
        this._unmounted = true;
        this._abortRunningQuery();  // todo: make this work w/ promises
    }
    _searchAnalyticsInScope() {
        return !this.props.compare && !this.props.searchInBook &&
            Sefaria.activeModule !== Sefaria.VOICES_MODULE;
    }
    // The tab the given props will actually display, matching SearchPage.activeTab():
    // `tab` comes from panel state and so from the URL, where it can be absent or garbage.
    _analyticsTab(props) {
        return ALL_TAB_IDS.includes(props.tab) ? props.tab : "sources";
    }
    componentWillReceiveProps(newProps) {
        if (this.props.query !== newProps.query) {
            // New query text within the same visit: same flow_id, new search_id.
            // Pass the tab explicitly rather than letting startQuery read the tab
            // SearchAnalytics currently holds: the browser can restore a history
            // entry whose query and tab both changed in one update, and this runs
            // before SearchPage.componentDidUpdate reports the new tab.
            SearchAnalytics.startQuery(newProps.query, this._analyticsTab(newProps));
            this.setState({...this._rerunState(newProps, false), isQueryRunning: !!newProps.query}, () => {
                this._executeAllQueries(newProps);
                if (!this.props.searchInBook) {
                    this.props.resetSearchFilters();
                }
            });
        } else if (!!this.props.disableAutocorrect !== !!newProps.disableAutocorrect) {
            // "Search instead for <query>" was clicked, or back/forward crossed that click.
            this.setState(this._rerunState(newProps, this.state.localDisableAutocorrect),
                          () => this._executeAllQueries(newProps));
        } else if (this._shouldUpdateQuery(this.props, newProps, this.props.searchState.type)) {
            // isQueryRunning: the query starts in the setState callback below; until then the
            // cleared hits must not read as a finished search (see the constructor).
            // _executeQuery starts nothing without a query.
            this.setState({...this._clearedHitsState(), isQueryRunning: !!newProps.query}, () => {
                this._executeQuery(newProps);
            })
        }
    }
    _rerunState(props, localDisableAutocorrect) {
        return {...this._freshResultsState(), localDisableAutocorrect,
                ...this._autocorrectStateFor(props, {localDisableAutocorrect})};
    }
    _clearedHitsState() {
        return {hits: [], pagesLoaded: 0, moreToLoad: true};
    }
    _freshResultsState() {
        // Also drops the old Sources total, which SearchPage's empty-tab auto-switch reads.
        return {...this._clearedHitsState(), totals: new SearchTotal(), totalsFor: null, isQueryRunning: true};
    }
    _autocorrectStateFor(props, state) {
        // What is known about the correction without asking anyone: nothing to decide when it's
        // off, or when the decision was already made for this query.
        if (!props.query || this._autocorrectDisabled(props, state)) { return this._decisionState({}); }
        const decision = Sefaria.search.getCachedDecision(props.query);
        return decision ? this._decisionState(decision)
                        : {correctedQuery: null, suggestedQueries: null, autocorrectResolved: false};
    }
    _decisionState({corrected_query, suggested_queries}) {
        return {correctedQuery: corrected_query || null, suggestedQueries: suggested_queries || null,
                autocorrectResolved: true};
    }
    async _executeTopicQuery(query) {
        const topicQuerier = new TopicQuerier();
        const d = await Sefaria.getName(query)
        if (this._unmounted || this._searchedQuery() !== query) { return; }  // superseded meanwhile
        let topics = d.completion_objects.filter(obj => obj.title.toUpperCase() === query.toUpperCase());
        const hasAuthor = topics.some(obj => obj.type === "AuthorTopic");
        if (hasAuthor) {
            topics = topics.filter(obj => obj.type !== "TocCategory");  //TocCategory is unhelpful if we have author
        }
        let searchTopics = await Promise.all(topics.map(async t => {
            if (t.type === 'ref') {
                return await topicQuerier.addRefTopic(t);
            } else if (t.type === 'TocCategory') {
                return topicQuerier.addTOCCategoryTopic(t);
            } else if (t.type === 'Collection') {
                return await topicQuerier.addCollection(t);
            } else {
                return await topicQuerier.addGeneralTopic(t);
            }
        }));
        if (this._unmounted || this._searchedQuery() !== query) { return; }
        this.setState({topics: searchTopics});
    }
    _searchedQuery(props = this.props) {
      return this.state.correctedQuery || props.query;
    }
    updateRunningQuery(ajax) {
      this.state.runningQueries = ajax;
      this.state.isQueryRunning = !!ajax;
      this.setState(this.state);
    }
    _abortRunningQuery() {
      if(this.state.runningQueries) {
          this.state.runningQueries.abort();  //todo: make work with promises
      }
      this.updateRunningQuery(null);
    }
    _shouldUpdateQuery(oldProps, newProps) {
      const oldSearchState = this._getSearchState(oldProps);
      const newSearchState = this._getSearchState(newProps);
      return !oldSearchState.isEqual({ other: newSearchState, fields: ['appliedFilters', 'field', 'sortType'] }) ||
        ((oldSearchState.filtersValid !== newSearchState.filtersValid) && oldSearchState.appliedFilters.length > 0);  // Execute a second query to apply filters after an initial query which got available filters
    }
    _getSearchState(props) {
      props = props || this.props;
      if (!props.query) {
          return;
      }
      return props['searchState'];
    }
    _executeAllQueries(props) {
      props = props || this.props;
      this._sourcesProbe = null;
      this._resolveAutocorrect(props).then(() => {
        if (this._unmounted || this.props.query !== props.query) { return; }
        // The Sources query may already be running, or done, as the check for whether the query
        // finds anything. If so it was for the text now being searched (otherwise there was a
        // correction), and its result stands. Another tab's results can decide before it's in,
        // so its analytics wait on it.
        const probe = this._sourcesProbe;
        if (probe?.query !== this._searchedQuery(props)) {
          this._executeQuery(props);
        } else {
          probe.total.then(total => {
            if (this._sourcesProbe === probe) { SearchAnalytics.recordApiResult('sources', total); }
          }, () => {});  // _handleError reported the failure
        }
        if (!this.props.searchInBook) {
          this._executeTopicQuery(this._searchedQuery());
        }
      });
    }
    _resolveAutocorrect(props) {
      // Resolves once it's known which text to search, with that in state; never rejects.
      if (this.state.autocorrectResolved) { return Promise.resolve(); }
      return Sefaria.search.decideAutocorrect(props.query, () => this._countResultsAsTyped(props)).then(decision => {
        if (this._unmounted || this.props.query !== props.query || this._autocorrectDisabled()) { return; }
        const state = this._decisionState(decision);
        // What the query as typed found is not what gets shown.
        if (state.correctedQuery) { Object.assign(state, this._freshResultsState()); }
        return new Promise(resolve => this.setState(state, resolve));
      });
    }
    _countResultsAsTyped(props) {
      // One promise of a result count for each tab that shows results, all searching the query
      // as typed. Sources runs its real query, which is kept if nothing gets corrected;
      // the entity tabs share Sefaria.search's cache with SearchPage, which repeats these requests
      // only if the text changes.
      // Superseded while the endpoint answered: searching now would abort the newer query.
      if (this._unmounted || this.props.query !== props.query) { return []; }
      const total = new Promise((resolve, reject) => this._executeQuery(props, {resolve, reject}));
      this._sourcesProbe = {query: props.query, total};
      const counts = [total];
      if (!this.props.searchInBook && Sefaria.activeModule !== Sefaria.VOICES_MODULE) {
        ENTITY_TYPES.forEach(type => {
          counts.push(Sefaria.search.entitySearch(props.query, type).then(data => data.total));
        });
      }
      return counts;
    }
    _getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, type) {
      // Returns a list of aggregations type which we should request from the server.

      // If there is only on possible filter (i.e. path for text) and filters are valid, no need to request again for any filter interactions
      if (filtersValid && aggregation_field_array.length === 1) { return []; }

      return Sefaria.util
        .zip(aggregation_field_array, aggregation_field_lang_suffix_array)
        .map(([agg, suffix_map]) => `${agg}${suffix_map ? suffix_map[Sefaria.interfaceLang] : ''}`); // add suffix based on interfaceLang to filter, if present in suffix_map
    }
    _executeQuery(props, probe) {
      //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
      // `probe` ({resolve, reject}), when given, gets the total, or the failure: this run is
      // the check for whether the query finds anything, and its analytics are held until
      // that's decided.
      props = props || this.props;
      if (!props.query) {
          return;
      }
      this._abortRunningQuery();

      let args = this._getQueryArgs(props);

      // If there are no available filters yet, don't apply filters.  Split into two queries:
      // 1) Get all potential filters and counts
      // 2) Apply filters (Triggered from componentWillReceiveProps)

      const request_applied = args.applied_filters;
      const searchState = this._getSearchState(props);
      const { appliedFilters, appliedFilterAggTypes } = searchState;
      const { aggregation_field_array, build_and_apply_filters } = SearchState.metadataByType[this.props.searchState.type];

      args.success = data => {
              // Report the "sources" API as returned. Duplicate reports (the
              // sources query re-runs when filters/sort change) are ignored
              // inside SearchAnalytics -- only the first response per search_id
              // counts toward firing search_query_executed.
              if (probe) {
                probe.resolve(data.hits.total.getValue());
              } else {
                SearchAnalytics.recordApiResult('sources', data.hits.total.getValue());
              }
              if (this.state.pagesLoaded === 0) { // Skip if pages have already been loaded from cache, but let aggregation processing below occur
                const currTotal = data.hits.total;
                // Results and "no longer running" in one update: as two, the render in between
                // would show the previous totals as this query's (e.g. a flash of NoSearchResults).
                let state = {
                  hits: data.hits.hits,
                  totals: currTotal,
                  totalsFor: args.query,
                  pagesLoaded: 1,
                  moreToLoad: currTotal.getValue() > this.querySize[this.props.searchState.type],
                  runningQueries: null,
                  isQueryRunning: false
                };
                this.setState(state);
                const filter_label = (request_applied && request_applied.length > 0) ? (' - ' + request_applied.join('|')) : '';
                const query_label = props.query + filter_label;
                Sefaria.track.event("Search", `${this.props.searchInBook? "SidebarSearch ": ""}Query: ${this.props.searchState.type}`, query_label, data.hits.total.getValue());
              } else {
                this.updateRunningQuery(null);
              }

              if (data.aggregations) {
                let availableFilters = [];
                let registry = {};
                let orphans = [];
                for (let aggregation of args.aggregationsToUpdate) {
                  if (!!data.aggregations[aggregation]) {
                    const { buckets } = data.aggregations[aggregation];
                    const {
                      availableFilters: tempAvailable,
                      registry: tempRegistry,
                      orphans: tempOrphans
                    } = Sefaria.search[build_and_apply_filters](buckets, appliedFilters, appliedFilterAggTypes, aggregation);
                    availableFilters.push(...tempAvailable);  // array concat
                    registry = extend(registry, tempRegistry);
                    orphans.push(...tempOrphans);
                  }
                }
                this.props.registerAvailableFilters(availableFilters, registry, orphans, args.aggregationsToUpdate);
              }
            };
      // A probe is rejected on abort too, unlike what _handleError reports: left unsettled, the
      // decision would wait on it forever.
      args.error = probe ? (failure => { this._handleError(failure); probe.reject(failure); }) : this._handleError;

      const runningQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(runningQuery);
    }
    _getQueryArgs(props) {
      props = props || this.props;

      const searchState = this._getSearchState(props);
      const { field, fieldExact, sortType, filtersValid, appliedFilters, appliedFilterAggTypes } = searchState;
      const request_applied = filtersValid && appliedFilters;
      const { aggregation_field_array,  aggregation_field_lang_suffix_array } = SearchState.metadataByType[this.props.searchState.type];
      const aggregationsToUpdate = this._getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, this.props.searchState.type);

      return {
        query: this._searchedQuery(props),
        type: this.props.searchState.type,
        applied_filters: request_applied,
        appliedFilterAggTypes,
        aggregationsToUpdate,
        size: this.querySize[this.props.searchState.type],
        field,
        sort_type: sortType,
        exact: fieldExact === field,
      };
    }
    _autocorrectDisabled(props = this.props, state = this.state) {
      return !!props.disableAutocorrect || state.localDisableAutocorrect;
    }
    disableAutocorrect = () => {
      // With a panel, the rerun happens when the change comes back as the disableAutocorrect prop.
      if (this._autocorrectDisabled()) { return; }
      if (this.props.onDisableAutocorrect) {
        this.props.onDisableAutocorrect();
        return;
      }
      this.setState(this._rerunState(this.props, true), () => this._executeAllQueries());
    }
    _loadNextPage() {
      console.log("load next page")
      const args = this._getQueryArgs(this.props);
      args.start = this.state.pagesLoaded * this.querySize[this.props.searchState.type];
      args.error = () => console.log("Failure in SearchResultList._loadNextPage");
      args.success =  data => {
          let nextHits = this.state.hits.concat(data.hits.hits);

          this.state.hits = nextHits;
          this.state.pagesLoaded += 1;
          if (this.state.pagesLoaded * this.querySize[this.props.searchState.type] >= this.state.totals.getValue() ) {
            this.state.moreToLoad = false;
          }

          this.setState(this.state);
          this.updateRunningQuery(null);
        };

      const runningNextPageQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(runningNextPageQuery, false);
    }
    /**
     * Called when the sources query fails. Receives the rejection value from
     * Sefaria.search.execute_query, which bundles jQuery's three $.ajax error arguments
     * into one object. `message` is not one of them -- it is there so that a plain Error
     * (a bug thrown inside the query rather than a failed request) still names itself
     * instead of being reported as 'unknown error'.
     */
    _handleError({textStatus, errorThrown, message} = {}) {
      if (textStatus === "abort") {
        // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
        //this.updateCurrentQuery(null);
        return;
      }
      SearchAnalytics.recordApiResult('sources', null, errorThrown || textStatus || message || 'unknown error');
      this.setState({error: true});
      this.updateRunningQuery(null);
    }
    normalizeHitsMetaData() {
        if (this.props.searchState.type === 'sheet') {
            let results = this.state.hits;
            return results.map(result => {
                let normalizedResult = result._source;
                normalizedResult.snippet = result.highlight.content.join('...');
                return normalizedResult;
            })
        }
        else {
            return this.state.hits;
        }
    }
    render () {
        // Until it's decided which text is searched, show nothing the answer could replace.
        const awaitingAutocorrect = !this.state.autocorrectResolved;
        const isVoices = Sefaria.activeModule === Sefaria.VOICES_MODULE;
        const SearchPageComponent = isVoices ? SearchInVoicesPage : SearchPage;
        return <SearchPageComponent
                    key={"searchPage"}
                    moreToLoad={this.state.moreToLoad}
                    isQueryRunning={this.state.isQueryRunning || awaitingAutocorrect}
                    autocorrectResolved={!awaitingAutocorrect}
                    searchTopMsg={isVoices && "search_page.results_for"}
                    query={this.props.query}
                    correctedQuery={this.state.correctedQuery}
                    suggestedQueries={this.state.suggestedQueries}
                    disableAutocorrect={this._autocorrectDisabled()}
                    onDisableAutocorrect={this.disableAutocorrect}
                    tab={this.props.tab}
                    setTab={this.props.setTab}
                    sortTypeArray={SearchState.metadataByType[this.props.searchState.type].sortTypeArray}
                    hits={awaitingAutocorrect ? [] : this.normalizeHitsMetaData()}
                    totalResults={awaitingAutocorrect ? new SearchTotal() : this.state.totals}
                    totalsFor={awaitingAutocorrect ? null : this.state.totalsFor}
                    type={this.props.searchState.type}
                    searchState={this.props.searchState}
                    settings={this.props.settings}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onResultClick}
                    openURL={this.props.openURL}
                    openDisplaySettings={this.props.openDisplaySettings}
                    toggleLanguage={this.props.toggleLanguage}
                    close={this.props.close}
                    onQueryChange={this.props.onQueryChange}
                    updateAppliedFilter={this.props.updateAppliedFilter}
                    updateAppliedOptionField={this.props.updateAppliedOptionField}
                    updateAppliedOptionSort={this.props.updateAppliedOptionSort}
                    registerAvailableFilters={this.props.registerAvailableFilters}
                    compare={this.props.compare}
                    loadNextPage={this._loadNextPage}
                    topics={this.state.topics}
                    searchInBook={this.props.searchInBook}
                  />
    }
}

ElasticSearchQuerier.propTypes = {
    query: PropTypes.string,
    tab: PropTypes.string,
    setTab: PropTypes.func,
    searchState: PropTypes.object,
    onResultClick: PropTypes.func,
    openURL: PropTypes.func,
    registerAvailableFilters: PropTypes.func,
    settings: PropTypes.object,
    openDisplaySettings: PropTypes.func,
    toggleLanguage: PropTypes.func,
    compare: PropTypes.bool,
    close: PropTypes.func,
    panelsOpen: PropTypes.number,
    onQueryChange: PropTypes.func,
    updateAppliedFilter: PropTypes.func,
    updateAppliedOptionSort: PropTypes.func,
    updateAppliedOptionField: PropTypes.func,
    resetSearchFilters:       PropTypes.func
};

export { ElasticSearchQuerier };
