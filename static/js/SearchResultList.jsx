import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Component from 'react-class';
import extend from 'extend';
import classNames from 'classnames';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { FilterNode } from './sefaria/search';
import SearchTextResult from './SearchTextResult';
import SearchSheetResult from './SearchSheetResult';
import SearchFilters from './SearchFilters';
import SearchState from './sefaria/searchState';
import {
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  InterfaceText,
  LoadingMessage,
} from './Misc';


class SearchResultList extends Component {
    constructor(props) {
      super(props);
      this.types = ['text', 'sheet'];
      this.querySize = {"text": 50, "sheet": 20};
      this.state = {
        runningQueries: this._typeObjDefault(null),
        isQueryRunning: this._typeObjDefault(false),
        moreToLoad:     this._typeObjDefault(true),
        totals:         this._typeObjDefault(0),
        pagesLoaded:    this._typeObjDefault(0),
        hits:           this._typeObjDefault([]),
        error:          false,
      }

      // Load search results from cache so they are available for immedate render
      this.types.map(t => {
        const args = this._getQueryArgs(props, t);
        let cachedQuery = Sefaria.search.getCachedQuery(args);
        while (cachedQuery) {
          // Load all pages of results that are available in cache, so if page X was 
          // previously loaded it will be returned. 
          //console.log("Loaded cached query for")
          //console.log(args);
          this.state.hits[t] = this.state.hits[t].concat(cachedQuery.hits.hits);
          this.state.totals[t] = cachedQuery.hits.total;
          this.state.pagesLoaded[t] += 1;
          args.start = this.state.pagesLoaded[t] * this.querySize[t];
          if (t === "text") {
            // Since texts only have one filter type, aggregations are only requested once on first page
            args.aggregationsToUpdate = [];
          }
          cachedQuery = Sefaria.search.getCachedQuery(args);
        }
      });
      this.updateTotalResults();
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
        });
        this._executeAllQueries(newProps);
      } else {
        this.types.forEach(t => {
          if (this._shouldUpdateQuery(this.props, newProps, t)) {
            let state = {
              hits: extend(this.state.hits, {[t]: []}),
              pagesLoaded: extend(this.state.pagesLoaded, {[t]: 0}),
              moreToLoad: extend(this.state.moreToLoad, {[t]: true})
            };
            this.setState(state);
            this._executeQuery(newProps, t);
          }
        });
      }
    }
    updateRunningQuery(type, ajax) {
      this.state.runningQueries[type] = ajax;
      this.state.isQueryRunning[type] = !!ajax;
      this.setState(this.state);
    }
    totalResults() {
      return this.types.reduce((accum, type) => (this.state.totals[type] + accum), 0);
    }
    updateTotalResults() {
      this.props.updateTotalResults(this.totalResults());
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
    _getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, type, interfaceLang) {
      // Returns a list of aggregations type which we should request from the server. 

      // If there is only on possible filter (i.e. path for text) and filters are valid, no need to request again for any filter interactions
      if (filtersValid && aggregation_field_array.length === 1) { return []; }
      
      return Sefaria.util
        .zip(aggregation_field_array, aggregation_field_lang_suffix_array)
        .map(([agg, suffix_map]) => `${agg}${suffix_map ? suffix_map[Sefaria.interfaceLang] : ''}`); // add suffix based on interfaceLang to filter, if present in suffix_map
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
              if (this.state.pagesLoaded[type] === 0) { // Skip if pages have already been loaded from cache, but let aggregation processing below occur
                let state = {
                  hits: extend(this.state.hits, {[type]: data.hits.hits}),
                  totals: extend(this.state.totals, {[type]: data.hits.total}),
                  pagesLoaded: extend(this.state.pagesLoaded, {[type]: 1}),
                  moreToLoad: extend(this.state.moreToLoad, {[type]: data.hits.total > this.querySize[type]})
                };
                this.setState(state, () => {
                  this.updateTotalResults();
                  this.handleScroll();
                });
                const filter_label = (request_applied && request_applied.length > 0) ? (' - ' + request_applied.join('|')) : '';
                const query_label = props.query + filter_label;
                Sefaria.track.event("Search", `Query: ${type}`, query_label, data.hits.total); 
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
                this.props.registerAvailableFilters(type, availableFilters, registry, orphans, args.aggregationsToUpdate);
              }
            };
      args.error = this._handleError;

      const runningQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(type, runningQuery);
    }
    _getQueryArgs(props, type) {
      props = props || this.props;

      const searchState = this._getSearchState(type, props);
      const { field, fieldExact, sortType, filtersValid, appliedFilters, appliedFilterAggTypes } = searchState;
      const request_applied = filtersValid && appliedFilters;
      const { aggregation_field_array,  aggregation_field_lang_suffix_array } = SearchState.metadataByType[type];
      const aggregationsToUpdate = this._getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, type);

      return {
        query: props.query,
        type,
        applied_filters: request_applied,
        appliedFilterAggTypes,
        aggregationsToUpdate,
        size: this.querySize[type],
        field,
        sort_type: sortType,
        exact: fieldExact === field,
      };
    }
    _loadNextPage(type) {
      console.log("load next page")
      const args = this._getQueryArgs(this.props, type);
      args.start = this.state.pagesLoaded[type] * this.querySize[type];
      args.error = () => console.log("Failure in SearchResultList._loadNextPage");
      args.success =  data => {
          var nextHits = this.state.hits[type].concat(data.hits.hits);

          this.state.hits[type] = nextHits;
          this.state.pagesLoaded[type] += 1;
          if (this.state.pagesLoaded[type] * this.querySize[type] >= this.state.totals[type] ) {
            this.state.moreToLoad[type] = false;
          }

          this.setState(this.state);
          this.updateRunningQuery(type, null);
        };

      const runningNextPageQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(type, runningNextPageQuery, false);
    }
    _handleError(jqXHR, textStatus, errorThrown) {
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
    render () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        const { tab }     = this.props;
        const searchState = this._getSearchState(tab);
        let results       = [];

        if (tab == "text") {
          results = Sefaria.search.mergeTextResultsVersions(this.state.hits.text);
          results = results.filter(result => !!result._source.version).map(result =>
            <SearchTextResult
              data={result}
              query={this.props.query}
              key={result._id}
              onResultClick={this.props.onResultClick} />
          );

        } else if (tab == "sheet") {
          results = this.state.hits.sheet.map(result =>
            <SearchSheetResult
              data={result}
              query={this.props.query}
              key={result._id}
              onResultClick={this.props.onResultClick} />
          );
        }

        const loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        const noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        const queryFullyLoaded = !this.state.moreToLoad[tab] && !this.state.isQueryRunning[tab];
        const haveResults      = !!results.length;
        results                = haveResults ? results : noResultsMessage;

        return (
          <div>
            <div className="searchTopMatter">
              <SearchTabs
                clickTextButton={this.showTexts}
                clickSheetButton={this.showSheets}
                textTotal={this.state.totals["text"]}
                sheetTotal={this.state.totals["sheet"]}
                currentTab={tab} />
              <SearchSortBox
                type={tab}
                updateAppliedOptionSort={this.props.updateAppliedOptionSort}
                sortType={searchState.sortType} />                
            </div>
            <div className="searchResultList">
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
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func,
};


const SearchTabs = ({clickTextButton, clickSheetButton, textTotal, sheetTotal, currentTab}) => (
  <div className="type-buttons sans-serif">
    <SearchTab label={"Sources"} total={textTotal} onClick={clickTextButton} active={currentTab === "text"} />
    <SearchTab label={"Sheets"} total={sheetTotal} onClick={clickSheetButton} active={currentTab === "sheet"} />
  </div>
);


const SearchTab = ({label, total, onClick, active}) => {
  total = total.addCommas()
  const classes = classNames({"search-dropdown-button": 1, active});

  return (
    <div className={classes} onClick={onClick} onKeyPress={e => {e.charCode === 13 ? onClick(e) : null}} role="button" tabIndex="0">
      <div className="type-button-title">
        <InterfaceText>{label}</InterfaceText>&nbsp;
        <InterfaceText>{`(${total})`}</InterfaceText>
      </div>
    </div>
  );
};


const SearchSortBox = ({type, updateAppliedOptionSort, sortType}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (newSortType) => {
    if (sortType === newSortType) {
      return;
    }
    updateAppliedOptionSort(type, newSortType);
    setIsOpen(false);
  }
  const filterTextClasses = classNames({ searchFilterToggle: 1, active: isOpen });
  return (
    <DropdownModal close={() => {setIsOpen(false)}} isOpen={isOpen}>
      <DropdownButton
        isOpen={isOpen}
        toggle={() => {setIsOpen(!isOpen)}}
        enText={"Sort"}
        heText={"מיון"}
        buttonStyle={true}
      />
      <DropdownOptionList
        isOpen={isOpen}
        options={SearchState.metadataByType[type].sortTypeArray}
        currOptionSelected={sortType}
        handleClick={handleClick}
      />
    </DropdownModal>
  );
}
SearchSortBox.propTypes = {
  type:                    PropTypes.string.isRequired,
  updateAppliedOptionSort: PropTypes.func,
  sortType:                PropTypes.string,
};


export default SearchResultList;