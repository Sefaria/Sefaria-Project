const {
  LoadingMessage,
}                       = require('./Misc');
const React             = require('react');
const ReactDOM          = require('react-dom');
const extend            = require('extend');
const $                 = require('./sefaria/sefariaJquery');
const Sefaria           = require('./sefaria/sefaria');
const { FilterNode }    = require('./sefaria/search');
const SearchTextResult  = require('./SearchTextResult');
const SearchSheetResult = require('./SearchSheetResult');
const SearchFilters     = require('./SearchFilters');
const SearchState       = require('./sefaria/searchState');
const PropTypes         = require('prop-types');
import Component        from 'react-class';


class SearchResultList extends Component {
    constructor(props) {
      super(props);
      this.types = ['text', 'sheet'];
      this.initialQuerySize = 100;
      this.backgroundQuerySize = 1000;
      this.maxResultSize = 10000;
      this.resultDisplayStep = 50;
      this.updateAppliedFilterByTypeMap      = this.types.reduce((obj, k) => { obj[k] = props.updateAppliedFilter.bind(null, k);      return obj; }, {});
      this.updateAppliedOptionFieldByTypeMap = this.types.reduce((obj, k) => { obj[k] = props.updateAppliedOptionField.bind(null, k); return obj; }, {});
      this.updateAppliedOptionSortByTypeMap  = this.types.reduce((obj, k) => { obj[k] = props.updateAppliedOptionSort.bind(null, k);  return obj; }, {});
      this.lastAppliedAggType = this._typeObjDefault(null);
      this.state = {
        runningQueries: this._typeObjDefault(null),
        isQueryRunning: this._typeObjDefault(false),
        moreToLoad:     this._typeObjDefault(true),
        totals:         this._typeObjDefault(0),
        pagesLoaded:    this._typeObjDefault(0),
        hits:           this._typeObjDefault([]),
        error:          false,
        showOverlay:    false,
        displayFilters: false,
        displaySort:    false,
      }

      // Restore hits and total from cache so they are available for immediate render
      this.types.map(t => {
        const args = this._getQueryArgs(props, t);
        const cachedQuery = Sefaria.search.getCachedQuery(args);
        if (cachedQuery) {
          this.state.hits[t] = cachedQuery.hits.hits;
          this.state.totals[t] = cachedQuery.hits.total;
        }
      });
    }
    updateRunningQuery(type, ajax) {
      this.state.runningQueries[type] = ajax;
      this.state.isQueryRunning[type] = !!ajax;
      this.setState(this.state);
    }
    updateLastAppliedAggType(aggType) {
      this.lastAppliedAggType[this.props.tab] = aggType;
    }
    _typeObjDefault(defaultValue) {
      // es6 version of dict comprehension...
      return this.types.reduce((obj, k) => { obj[k] = defaultValue; return obj; }, {});
    }
    _abortRunningQueries() {
      this.types.forEach(t => this._abortRunningQuery(t));
    }
    _abortRunningQuery(type) {
      if(this.state.runningQueries[type]) {
          this.state.runningQueries[type].abort();  //todo: make work with promises
      }
      this.updateRunningQuery(type, null);
    }
    componentDidMount() {
        this._executeAllQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").on("scroll.infiteScroll", this.handleScroll);
    }
    componentWillUnmount() {
        this._abortRunningQueries();  // todo: make this work w/ promises
        $(ReactDOM.findDOMNode(this)).closest(".content").off("scroll.infiniteScroll", this.handleScroll);
    }
    componentWillReceiveProps(newProps) {
      if(this.props.query != newProps.query) {
        this.setState({
          totals: this._typeObjDefault(0),
          hits: this._typeObjDefault([]),
          moreToLoad: this._typeObjDefault(true),
          displayFilters: false,
          displaySort: false,
          showOverlay: false
        });
        this._executeAllQueries(newProps);
      } else {
        this.types.forEach(t => {
          if (this._shouldUpdateQuery(this.props, newProps, t)) {
            this._executeQuery(newProps, t);
          }
        })
      }
    }
    handleScroll() {
      var tab = this.props.tab;

      if (!this.state.moreToLoad[tab]) { return; }
      if (this.state.runningQueries[tab]) { return; }

      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 300;

      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this._loadNextPage(tab);
      }
    }
    _shouldUpdateQuery(oldProps, newProps, type) {
      const oldSearchState = this._getSearchState(type, oldProps);
      const newSearchState = this._getSearchState(type, newProps);
      return !oldSearchState.isEqual({ other: newSearchState, fields: ['appliedFilters', 'field', 'sortType'] }) ||
        ((oldSearchState.filtersValid !== newSearchState.filtersValid) && oldSearchState.appliedFilters.length > 0);  // Execute a second query to apply filters after an initial query which got available filters
    }
    _getSearchState(type, props) {
      props = props || this.props;
      if (!props.query) {
          return;
      }
      return props[`${type}SearchState`];
    }
    _executeAllQueries(props) {
      this.types.forEach(t => this._executeQuery(props, t));
    }
    _executeQuery(props, type) {
      //This takes a props object, so as to be able to handle being called from componentWillReceiveProps with newProps
      props = props || this.props;
      if (!props.query) {
          return;
      }
      this._abortRunningQuery(type);

      let args = this._getQueryArgs(props, type);

      // If there are no available filters yet, don't apply filters.  Split into two queries:
      // 1) Get all potential filters and counts
      // 2) Apply filters (Triggered from componentWillReceiveProps)

      const request_applied = args.applied_filters;
      const searchState = this._getSearchState(type, props);
      const { appliedFilters, appliedFilterAggTypes } = searchState;
      const { aggregation_field_array, build_and_apply_filters } = SearchState.metadataByType[type];

      args.success = data => {
              this.updateRunningQuery(type, null);
              const hitArray = type === 'text' ? Sefaria.search.process_text_hits(data.hits.hits) : data.hits.hits;  // TODO need if statement? or will there be similar processing done on sheets?
              let state = {
                hits: extend(this.state.hits, {[type]: hitArray}),
                totals: extend(this.state.totals, {[type]: data.hits.total}),
                pagesLoaded: extend(this.state.pagesLoaded, {[type]: 1}),
                moreToLoad: extend(this.state.moreToLoad, {[type]: data.hits.total > this.initialQuerySize})
              };
              this.setState(state);
              const filter_label = (request_applied && request_applied.length > 0) ? (' - ' + request_applied.join('|')) : '';
              const query_label = props.query + filter_label;
              Sefaria.track.event("Search", `Query: ${type}`, query_label, data.hits.total);

              if (data.aggregations) {
                let availableFilters = [];
                let registry = {};
                let orphans = [];
                for (let aggregation of aggregation_field_array) {
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
                this.props.registerAvailableFilters(type, availableFilters, registry, orphans, args.aggregationsToUpdate);
              }
          }
      args.error = this._handle_error;

      const runningQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(type, runningQuery);
    }
    _getQueryArgs(props, type) {
      props = props || this.props;

      const searchState = this._getSearchState(type, props);
      const { field, fieldExact, sortType, filtersValid, appliedFilters, appliedFilterAggTypes } = searchState;
      const request_applied = filtersValid && appliedFilters;
      const { aggregation_field_array } = SearchState.metadataByType[type];
      const uniqueAggTypes = [...(new Set(appliedFilterAggTypes))];
      const justUnapplied = uniqueAggTypes.indexOf(this.lastAppliedAggType[type]) === -1; // if you just unapplied an aggtype filter completely, make sure you rerequest that aggType's filters also in case they were deleted
      const aggregationsToUpdate = filtersValid && aggregation_field_array.length === 1 ? [] : aggregation_field_array.filter( a => justUnapplied || a !== this.lastAppliedAggType[type]);

      return {
        query: props.query,
        type,
        applied_filters: request_applied,
        appliedFilterAggTypes,
        aggregationsToUpdate,
        size: this.initialQuerySize,
        field,
        sort_type: sortType,
        exact: fieldExact === field,
      };
    }
    _loadNextPage(type) {
      const args = this._getQueryArgs(this.props, type);
      args.start = this.state.pagesLoaded[type] * this.initialQuerySize;
      args.error = () => console.log("Failure in SearchResultList._loadNextPage");
      args.success =  data => {
          var nextHits = this.state.hits[type].concat(data.hits.hits);
          if (type === "text") {
            nextHits = Sefaria.search.process_text_hits(nextHits);
          }

          this.state.hits[type] = nextHits;
          this.state.pagesLoaded[type] += 1;
          if (this.state.pagesLoaded[type] * this.initialQuerySize >= this.state.totals[type] ) {
            this.state.moreToLoad[type] = false;
          }

          this.setState(this.state);
          this.updateRunningQuery(type, null);
        };

      const runningNextPageQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(type, runningNextPageQuery, false);
    }
    _handle_error(jqXHR, textStatus, errorThrown) {
        if (textStatus == "abort") {
            // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
            //this.updateCurrentQuery(null);
            return;
        }
        this.setState({error: true});
        this.updateRunningQuery(null, null);
    }
    showSheets() {
      this.props.updateTab('sheet');
    }
    showTexts() {
      this.props.updateTab('text');
    }
    showResultsOverlay(shouldShow) {
      //overlay gives opacity to results when either filter box or sort box is open
      this.setState({showOverlay: shouldShow});
    }
    toggleFilterView() {
      this.showResultsOverlay(!this.state.displayFilters);
      this.setState({displayFilters: !this.state.displayFilters, displaySort: false});
    }
    toggleSortView() {
      this.showResultsOverlay(!this.state.displaySort);
      this.setState({displaySort: !this.state.displaySort, displayFilters: false});
    }
    closeFilterView() {
      this.showResultsOverlay(false);
      this.setState({displayFilters: false});
    }
    closeSortView() {
      this.showResultsOverlay(false);
      this.setState({displaySort: false});
    }
    render () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        var { tab } = this.props;
        var results = [];

        if (tab == "text") {
          results = this.state.hits.text.filter(result => !!result._source.version).map(result =>
            <SearchTextResult
                data={result}
                query={this.props.query}
                key={result._id}
                onResultClick={this.props.onResultClick} />);

        } else if (tab == "sheet") {
          results = this.state.hits.sheet.map(result =>
              <SearchSheetResult
                    data={result}
                    query={this.props.query}
                    key={result._id} />);
        }

        var loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        var noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        var queryFullyLoaded = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
        var haveResults      = !!results.length;
        results              = haveResults ? results : noResultsMessage;
        var searchFilters    = (<SearchFilters
                                  query = {this.props.query}
                                  searchState={this._getSearchState(this.props.tab)}
                                  total = {this.state.totals["text"] + this.state.totals["sheet"]}
                                  textTotal = {this.state.totals["text"]}
                                  sheetTotal = {this.state.totals["sheet"]}
                                  updateAppliedFilter      = {this.updateAppliedFilterByTypeMap[this.props.tab]}
                                  updateAppliedOptionField = {this.updateAppliedOptionFieldByTypeMap[this.props.tab]}
                                  updateAppliedOptionSort  = {this.updateAppliedOptionSortByTypeMap[this.props.tab]}
                                  updateLastAppliedAggType={this.updateLastAppliedAggType}
                                  isQueryRunning = {this.state.isQueryRunning[tab]}
                                  type = {this.props.tab}
                                  clickTextButton = {this.showTexts}
                                  clickSheetButton = {this.showSheets}
                                  showResultsOverlay = {this.showResultsOverlay}
                                  displayFilters={this.state.displayFilters}
                                  displaySort={this.state.displaySort}
                                  toggleFilterView={this.toggleFilterView}
                                  toggleSortView={this.toggleSortView}
                                  closeFilterView={this.closeFilterView}
                                  closeSortView={this.closeSortView}/>);
        //console.log(this.state);
        //debugger;
        return (
          <div>
            { searchFilters }
            <div className={this.state.showOverlay ? "searchResultsOverlay" : ""}>
              { queryFullyLoaded || haveResults ? results : null }
              { this.state.isQueryRunning[tab] ? loadingMessage : null }
            </div>
          </div>
        );
    }
}
SearchResultList.propTypes = {
  query:                    PropTypes.string,
  tab:                      PropTypes.oneOf(["text", "sheet"]),
  textSearchState:          PropTypes.object,
  sheetSearchState:         PropTypes.object,
  onResultClick:            PropTypes.func,
  updateTab:                PropTypes.func,
  updateAppliedFilter:      PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func,
};


module.exports = SearchResultList;
