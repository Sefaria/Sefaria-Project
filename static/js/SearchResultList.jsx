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
        displayedUntil: this._typeObjDefault(50),
        hits:           this._typeObjDefault([]),
        activeTab:      this.types[0],
        error:          false,
        showOverlay:    false,
        displayFilters: false,
        displaySort:    false,
      }
    }

    updateRunningQuery(type, ajax, isLoadingRemainder) {
      this.state.runningQueries[type] = ajax;
      this.state.isQueryRunning[type] = !!ajax && !isLoadingRemainder;
      this.setState({
        runningQueries: this.state.runningQueries,
        isQueryRunning: this.state.isQueryRunning
      });
    }

    updateLastAppliedAggType(aggType) {
      this.lastAppliedAggType[this.state.activeTab] = aggType;
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
          this.state.runningQueries[type].abort();
      }
      this.updateRunningQuery(type, null, false);
    }

    componentDidMount() {
        this._executeAllQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").bind("scroll", this.handleScroll);
    }

    componentWillUnmount() {
        this._abortRunningQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").unbind("scroll", this.handleScroll);
    }

    handleScroll() {
      var tab = this.state.activeTab;
      if (this.state.displayedUntil[tab] >= this.state.totals[tab]) { return; }
      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 100;
      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this._extendResultsDisplayed();
      }
    }

    _extendResultsDisplayed() {
      const { activeTab } = this.state;
      this.state.displayedUntil[activeTab] += this.resultDisplayStep;
      if (this.state.displayedUntil[activeTab] >= this.state.totals[activeTab]) {
        this.state.displayedUntil[activeTab] = this.state.totals[activeTab];
      }
      this.setState({ displayedUntil: this.state.displayedUntil });
    }

    componentWillReceiveProps(newProps) {
      if(this.props.query != newProps.query) {
        this.setState({
          totals: this._typeObjDefault(0),
          hits: this._typeObjDefault([]),
          moreToLoad: this._typeObjDefault(true),
          displayedUntil: this._typeObjDefault(50),
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

    _loadRemainder(type, last, total, currentHits) {
    // Having loaded "last" results, and with "total" results to load, load the rest, this.backgroundQuerySize at a time
      if (last >= total || last >= this.maxResultSize) {
        this.updateRunningQuery(type, null, false);
        this.state.moreToLoad[type] = false;
        this.setState({moreToLoad: this.state.moreToLoad});
        return;
      }

      let size = this.backgroundQuerySize;
      if (last + size > this.maxResultSize) {
        size = this.maxResultSize - last;
      }

      const searchState = this._getSearchState(type);
      const { field, sortType, fieldExact, appliedFilters, appliedFilterAggTypes } = searchState;
      const query_props = {
        query: this.props.query,
        type,
        size,
        from: last,
        field,
        sort_type: sortType,
        get_filters: false,
        applied_filters: appliedFilters,
        appliedFilterAggTypes,
        aggregationsToUpdate: [],
        exact: fieldExact === field,
        error: function() {  console.log("Failure in SearchResultList._loadRemainder"); },
        success: data => {
          var nextHits = currentHits.concat(data.hits.hits);
          if (type === "text") {
            nextHits = Sefaria.search.process_text_hits(nextHits);
          }

          this.state.hits[type] = nextHits;

          this.setState({hits: this.state.hits});
          this._loadRemainder(type, last + this.backgroundQuerySize, total, nextHits);
        }
      };

      const runningLoadRemainderQuery = Sefaria.search.execute_query(query_props);
      this.updateRunningQuery(type, runningLoadRemainderQuery, true);
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
      // If there are no available filters yet, don't apply filters.  Split into two queries:
      // 1) Get all potential filters and counts
      // 2) Apply filters (Triggered from componentWillReceiveProps)
      const searchState = this._getSearchState(type, props);
      const { field, fieldExact, sortType, filtersValid, appliedFilters, appliedFilterAggTypes } = searchState;
      const request_applied = filtersValid && appliedFilters;
      const isCompletionStep = request_applied || appliedFilters.length === 0;
      const { aggregation_field_array, build_and_apply_filters } = SearchState.metadataByType[type];
      const uniqueAggTypes = [...(new Set(appliedFilterAggTypes))];
      const justUnapplied = uniqueAggTypes.indexOf(this.lastAppliedAggType[type]) === -1; // if you just unapplied an aggtype filter completely, make sure you rerequest that aggType's filters also in case they were deleted
      const aggregationsToUpdate = aggregation_field_array.filter( a => justUnapplied || a !== this.lastAppliedAggType[type]);
      const runningQuery = Sefaria.search.execute_query({
          query: props.query,
          type,
          get_filters: !filtersValid,
          applied_filters: request_applied,
          appliedFilterAggTypes,
          aggregationsToUpdate,
          size: this.initialQuerySize,
          field,
          sort_type: sortType,
          exact: fieldExact === field,
          success: data => {
              this.updateRunningQuery(type, null, false);
              const hitArray = type === 'text' ? Sefaria.search.process_text_hits(data.hits.hits) : data.hits.hits;  // TODO need if statement? or will there be similar processing done on sheets?
              this.setState({
                hits: extend(this.state.hits, {[type]: hitArray}),
                totals: extend(this.state.totals, {[type]: data.hits.total}),
              });
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
                    const { availableFilters: tempAvailable, registry: tempRegistry, orphans: tempOrphans } = Sefaria.search[build_and_apply_filters](buckets, appliedFilters, appliedFilterAggTypes, aggregation);
                    availableFilters.push(...tempAvailable);  // array concat
                    registry = extend(registry, tempRegistry);
                    orphans.push(...tempOrphans);
                  }
                }
                this.props.registerAvailableFilters(type, availableFilters, registry, orphans, aggregationsToUpdate);
              }
              if(isCompletionStep) {
                this._loadRemainder(type, this.initialQuerySize, data.hits.total, hitArray);
              }
          },
          error: this._handle_error
      });

      this.updateRunningQuery(type, runningQuery, false);
    }

    _handle_error(jqXHR, textStatus, errorThrown) {
        if (textStatus == "abort") {
            // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
            //this.updateCurrentQuery(null);
            return;
        }
        this.setState({error: true});
        this.updateRunningQuery(null, null, false);
    }
    showSheets() {
      this.setState({activeTab: 'sheet'});
    }
    showTexts() {
      this.setState({activeTab: 'text'});
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

        var tab = this.state.activeTab;
        var results = [];

        if (tab == "text") {
          results = this.state.hits.text.slice(0,this.state.displayedUntil["text"]).filter(result => !!result._source.version).map(result =>
            <SearchTextResult
                data={result}
                query={this.props.query}
                key={result._id}
                onResultClick={this.props.onResultClick} />);

        } else if (tab == "sheet") {
          results = this.state.hits.sheet.slice(0, this.state.displayedUntil["sheet"]).map(result =>
              <SearchSheetResult
                    data={result}
                    query={this.props.query}
                    key={result._id} />);
        }

        var loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        var noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        var queryFullyLoaded      = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
        var haveResults      = !!results.length;
        results              = haveResults ? results : noResultsMessage;
        var searchFilters    = (<SearchFilters
                                  query = {this.props.query}
                                  searchState={this._getSearchState(this.state.activeTab)}
                                  total = {this.state.totals["text"] + this.state.totals["sheet"]}
                                  textTotal = {this.state.totals["text"]}
                                  sheetTotal = {this.state.totals["sheet"]}
                                  updateAppliedFilter      = {this.updateAppliedFilterByTypeMap[this.state.activeTab]}
                                  updateAppliedOptionField = {this.updateAppliedOptionFieldByTypeMap[this.state.activeTab]}
                                  updateAppliedOptionSort  = {this.updateAppliedOptionSortByTypeMap[this.state.activeTab]}
                                  updateLastAppliedAggType={this.updateLastAppliedAggType}
                                  isQueryRunning = {this.state.isQueryRunning[tab]}
                                  type = {this.state.activeTab}
                                  clickTextButton = {this.showTexts}
                                  clickSheetButton = {this.showSheets}
                                  showResultsOverlay = {this.showResultsOverlay}
                                  displayFilters={this.state.displayFilters}
                                  displaySort={this.state.displaySort}
                                  toggleFilterView={this.toggleFilterView}
                                  toggleSortView={this.toggleSortView}
                                  closeFilterView={this.closeFilterView}
                                  closeSortView={this.closeSortView}/>);
        return (
          <div>
            { searchFilters }
            <div className={this.state.showOverlay ? "searchResultsOverlay" : ""}>
              { queryFullyLoaded || haveResults ? results : loadingMessage }
            </div>
          </div>
        );
    }
}
SearchResultList.propTypes = {
  query:                    PropTypes.string,
  textSearchState:          PropTypes.object,
  sheetSearchState:         PropTypes.object,
  onResultClick:            PropTypes.func,
  updateAppliedFilter:      PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func
};


module.exports = SearchResultList;
