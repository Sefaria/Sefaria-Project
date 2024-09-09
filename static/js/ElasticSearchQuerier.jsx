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
import SearchPage from "./SearchPage";

class TopicQuerier {
    async addCollection(collection) {
        const d = await Sefaria.getCollection(collection.key);
        return {
            analyticCat: "Collection",
            title: d.name,
            heTitle: d.name,
            url: "/collections/" + collection.key,
            topicCat: "Collections",
            heTopicCat: Sefaria.hebrewTranslation("Collections"),
            enDesc: d.description,
            heDesc: d.description,
            numSheets: d.sheets.length
        }
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
        const typeObj = Sefaria.topicTocCategory(topic.key);
        if (!typeObj) {
            searchTopic.topicCat = "Topics";
            searchTopic.heTopicCat = Sefaria.hebrewTranslation("Topics");
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
      this.querySize = {"text": 50, "sheet": 20};
      this.state = {
        runningQueries: null,
        isQueryRunning: false,
        moreToLoad:     true,
        totals:         new SearchTotal(),
        pagesLoaded:    0,
        hits:           [],
        error:          false,
        topics:         []
      }

      // Load search results from cache so they are available for immediate render

      const args = this._getQueryArgs(props);
      let cachedQuery = Sefaria.search.getCachedQuery(args);
      while (cachedQuery) {
          // Load all pages of results that are available in cache, so if page X was
          // previously loaded it will be returned.
          //console.log("Loaded cached query for")
          //console.log(args);
          this.state.hits = this.state.hits.concat(cachedQuery.hits.hits);
          this.state.totals = cachedQuery.hits.total;
          this.state.pagesLoaded += 1;
          args.start = this.state.pagesLoaded * this.querySize[this.props.searchState.type];
          if (this.props.searchState.type === "text") {
            // Since texts only have one filter type, aggregations are only requested once on first page
            args.aggregationsToUpdate = [];
          }
          cachedQuery = Sefaria.search.getCachedQuery(args);
      }
    }
    componentDidMount() {
        this._executeAllQueries();
    }
    componentWillUnmount() {
        this._abortRunningQuery();  // todo: make this work w/ promises
    }
    componentWillReceiveProps(newProps) {
        let state = {
            hits: [],
            pagesLoaded: 0,
            moreToLoad: true
        };
        if (this.props.query !== newProps.query) {
            this.setState(state, () => {
                this._executeAllQueries(newProps);
                if (!this.props.searchInBook) {
                    this.props.resetSearchFilters();
                }
            });
        } else if (this._shouldUpdateQuery(this.props, newProps, this.props.searchState.type)) {
            this.setState(state, () => {
                this._executeQuery(newProps, this.props.searchState.type);
            })
        }
    }
    async _executeTopicQuery() {
        const topicQuerier = new TopicQuerier();
        const d = await Sefaria.getName(this.props.query)
        let topics = d.completion_objects.filter(obj => obj.title.toUpperCase() === this.props.query.toUpperCase());
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
        this.setState({topics: searchTopics});
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
      if (!this.props.searchInBook) {
        this._executeTopicQuery();
      }
      this._executeQuery(props, this.props.searchState.type);
    }
    _getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, type) {
      // Returns a list of aggregations type which we should request from the server.

      // If there is only on possible filter (i.e. path for text) and filters are valid, no need to request again for any filter interactions
      if (filtersValid && aggregation_field_array.length === 1) { return []; }

      return Sefaria.util
        .zip(aggregation_field_array, aggregation_field_lang_suffix_array)
        .map(([agg, suffix_map]) => `${agg}${suffix_map ? suffix_map[Sefaria.interfaceLang] : ''}`); // add suffix based on interfaceLang to filter, if present in suffix_map
    }
    _executeQuery(props) {
      //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
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
              this.updateRunningQuery(null);
              if (this.state.pagesLoaded === 0) { // Skip if pages have already been loaded from cache, but let aggregation processing below occur
                const currTotal = data.hits.total;
                let state = {
                  hits: data.hits.hits,
                  totals: currTotal,
                  pagesLoaded: 1,
                  moreToLoad: currTotal.getValue() > this.querySize[this.props.searchState.type]
                };
                this.setState(state);
                const filter_label = (request_applied && request_applied.length > 0) ? (' - ' + request_applied.join('|')) : '';
                const query_label = props.query + filter_label;
                Sefaria.track.event("Search", `${this.props.searchInBook? "SidebarSearch ": ""}Query: ${this.props.searchState.type}`, query_label, data.hits.total.getValue());
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
      args.error = this._handleError;

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
        query: props.query,
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
    _handleError(jqXHR, textStatus, errorThrown) {
      if (textStatus === "abort") {
        // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
        //this.updateCurrentQuery(null);
        return;
      }
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
        return <SearchPage
                    key={"searchPage"}
                    moreToLoad={this.state.moreToLoad}
                    isQueryRunning={this.state.isQueryRunning}
                    searchTopMsg="Results for"
                    query={this.props.query}
                    sortTypeArray={SearchState.metadataByType[this.props.searchState.type].sortTypeArray}
                    hits={this.normalizeHitsMetaData()}
                    totalResults={this.state.totals}
                    type={this.props.searchState.type}
                    searchState={this.props.searchState}
                    settings={this.props.settings}
                    panelsOpen={this.props.panelsOpen}
                    onResultClick={this.props.onResultClick}
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
    searchState: PropTypes.object,
    onResultClick: PropTypes.func,
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