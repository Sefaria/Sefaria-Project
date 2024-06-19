import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Component from 'react-class';
import extend from 'extend';
import classNames from 'classnames';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
import { SearchTotal } from "./sefaria/searchTotal";
import SearchTextResult from './SearchTextResult';
import SearchSheetResult from './SearchSheetResult';
import SearchFilters from './SearchFilters';
import SearchState from './sefaria/searchState';
import Strings from "./sefaria/strings.js"
import {
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  InterfaceText,
  LoadingMessage,
} from './Misc';





const SourcesSheetsDiv = (props) => {
    let sourcesSheetsCounts = [];
    let sheetsURL, sourcesURL;
    if (props?.numSources > 0 && props?.numSheets > 0) { // if there's both, we need to specify two different URLs
        sheetsURL = props.url + "?tab=sheets";
        sourcesURL = props.url + "?tab=sources";
    }
    else {
        sheetsURL = props.url;
        sourcesURL = props.url;
    }

    if (props?.numSources > 0) {
        const sourcesDiv = <span><a href={sourcesURL}><InterfaceText>{props.numSources}</InterfaceText> <InterfaceText>Sources</InterfaceText></a></span>;
        sourcesSheetsCounts.push(sourcesDiv);
    }
    if (props?.numSheets > 0) {
        const sheetsDiv = <span><a href={sheetsURL}><InterfaceText>{props.numSheets}</InterfaceText> <InterfaceText>Sheets</InterfaceText></a></span>;
        sourcesSheetsCounts.push(sheetsDiv);
    }

    if (sourcesSheetsCounts.length === 0) {
        return null;
    }
    else {
        return <div className="topicSourcesSheets systemText">{sourcesSheetsCounts.reduce((prev, curr) => [prev, " ∙ ",  curr])}</div>;
    }
}


const SearchTopic = (props) => {
    const sourcesSheetsDiv = <SourcesSheetsDiv url={props.topic.url} numSheets={props.topic.numSheets} numSources={props.topic.numSources}/>;
    const topicTitle = <div className="topicTitle">
                          <h1>
                          <a href={props.topic.url} onClick={() => Sefaria.track.event("Search", "topic in search click", props.topic.analyticCat+"|"+props.topic.title)}><InterfaceText text={{en:props.topic.title, he:props.topic.heTitle}}/></a>
                          </h1>
                        </div>;
    const topicCategory = <div className="topicCategory sectionTitleText">
                            <InterfaceText text={{en:props.topic.topicCat, he:props.topic.heTopicCat}}/>
                          </div>;
    return <div className="searchTopic">
                {topicTitle}
                {topicCategory}
                {"enDesc" in props.topic ?
                    <div className="topicDescSearchResult systemText">
                       <InterfaceText markdown={{en:props.topic.enDesc, he:props.topic.heDesc}}/>
                    </div> : null}
                {sourcesSheetsDiv}
        </div>
}


class SearchResultList extends Component {
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
          args.start = this.state.pagesLoaded * this.querySize[this.props.type];
          if (this.props.type === "text") {
            // Since texts only have one filter type, aggregations are only requested once on first page
            args.aggregationsToUpdate = [];
          }
          cachedQuery = Sefaria.search.getCachedQuery(args);
      }
      this.updateTotalResults();
    }
    componentDidMount() {
        this._executeAllQueries();
        $(ReactDOM.findDOMNode(this)).closest(".content").on("scroll.infiteScroll", this.handleScroll);
    }
    componentWillUnmount() {
        this._abortRunningQuery();  // todo: make this work w/ promises
        $(ReactDOM.findDOMNode(this)).closest(".content").off("scroll.infiniteScroll", this.handleScroll);
    }
    componentWillReceiveProps(newProps) {
      if(this.props.query !== newProps.query) {
        this.setState({
          totals: new SearchTotal(),
          hits: [],
          moreToLoad: true,
        });
        this._executeAllQueries(newProps);
      } else if (this._shouldUpdateQuery(this.props, newProps, this.props.type)) {
              let state = {
                  hits: [],
                  pagesLoaded: 0,
                  moreToLoad: true
              };
              this.setState(state, () => {
                  this._executeQuery(newProps, this.props.type);
              })
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
    async _executeTopicQuery() {
        const d = await Sefaria.getName(this.props.query)
        let topics = d.completion_objects.filter(obj => obj.title.toUpperCase() === this.props.query.toUpperCase());
        const hasAuthor = topics.some(obj => obj.type === "AuthorTopic");
        if (hasAuthor) {
            topics = topics.filter(obj => obj.type !== "TocCategory");  //TocCategory is unhelpful if we have author
        }
        let searchTopics = await Promise.all(topics.map(async t => {
            if (t.type === 'ref') {
                return await this.addRefTopic(t);
            } else if (t.type === 'TocCategory') {
                return this.addTOCCategoryTopic(t);
            } else if (t.type === 'Collection') {
                return await this.addCollection(t);
            } else {
                return await this.addGeneralTopic(t);
            }
        }));
        this.setState({topics: searchTopics});
    }
    updateRunningQuery(ajax) {
      this.state.runningQueries = ajax;
      this.state.isQueryRunning = !!ajax;
      this.setState(this.state);
    }
    totalResults() {
      return this.state.totals;
    }
    updateTotalResults() {
      this.props.updateTotalResults(this.totalResults());
    }
    _abortRunningQuery() {
      if(this.state.runningQueries) {
          this.state.runningQueries.abort();  //todo: make work with promises
      }
      this.updateRunningQuery(null);
    }
    handleScroll() {
      if (!this.state.moreToLoad) { return; }
      if (this.state.runningQueries) { return; }

      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 300;
      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this._loadNextPage();
      }
    }
    _shouldUpdateQuery(oldProps, newProps) {
      const oldSearchState = this._getSearchState(this.props.type, oldProps);
      const newSearchState = this._getSearchState(this.props.type, newProps);
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
      this._executeTopicQuery();
      this._executeQuery(props, this.props.type);
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
      const searchState = this._getSearchState(this.props.type, props);
      const { appliedFilters, appliedFilterAggTypes } = searchState;
      const { aggregation_field_array, build_and_apply_filters } = SearchState.metadataByType[this.props.type];

      args.success = data => {
              this.updateRunningQuery(null);
              if (this.state.pagesLoaded === 0) { // Skip if pages have already been loaded from cache, but let aggregation processing below occur
                const currTotal = data.hits.total;
                let state = {
                  hits: data.hits.hits,
                  totals: currTotal,
                  pagesLoaded: 1,
                  moreToLoad: currTotal.getValue() > this.querySize[this.props.type]
                };
                this.setState(state, () => {
                  this.updateTotalResults();
                  this.handleScroll();
                });
                const filter_label = (request_applied && request_applied.length > 0) ? (' - ' + request_applied.join('|')) : '';
                const query_label = props.query + filter_label;
                Sefaria.track.event("Search", `${this.props.searchInBook? "SidebarSearch ": ""}Query: ${this.props.type}`, query_label, data.hits.total.getValue());
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
                this.props.registerAvailableFilters(this.props.type, availableFilters, registry, orphans, args.aggregationsToUpdate);
              }
            };
      args.error = this._handleError;

      const runningQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(runningQuery);
    }
    _getQueryArgs(props) {
      props = props || this.props;

      const searchState = this._getSearchState(this.props.type, props);
      const { field, fieldExact, sortType, filtersValid, appliedFilters, appliedFilterAggTypes } = searchState;
      const request_applied = filtersValid && appliedFilters;
      const { aggregation_field_array,  aggregation_field_lang_suffix_array } = SearchState.metadataByType[this.props.type];
      const aggregationsToUpdate = this._getAggsToUpdate(filtersValid, aggregation_field_array, aggregation_field_lang_suffix_array, appliedFilterAggTypes, this.props.type);

      return {
        query: props.query,
        type: this.props.type,
        applied_filters: request_applied,
        appliedFilterAggTypes,
        aggregationsToUpdate,
        size: this.querySize[this.props.type],
        field,
        sort_type: sortType,
        exact: fieldExact === field,
      };
    }
    _loadNextPage() {
      console.log("load next page")
      const args = this._getQueryArgs(this.props);
      args.start = this.state.pagesLoaded * this.querySize[this.props.type];
      args.error = () => console.log("Failure in SearchResultList._loadNextPage");
      args.success =  data => {
          let nextHits = this.state.hits.concat(data.hits.hits);

          this.state.hits = nextHits;
          this.state.pagesLoaded += 1;
          if (this.state.pagesLoaded * this.querySize[this.props.type] >= this.state.totals.getValue() ) {
            this.state.moreToLoad = false;
          }

          this.setState(this.state);
          this.updateRunningQuery(null);
        };

      const runningNextPageQuery = Sefaria.search.execute_query(args);
      this.updateRunningQuery(runningNextPageQuery, false);
    }
    _handleError(jqXHR, textStatus, errorThrown) {
      if (textStatus == "abort") {
        // Abort is immediately followed by new query, above.  Worried there would be a race if we call updateCurrentQuery(null) from here
        //this.updateCurrentQuery(null);
        return;
      }
      this.setState({error: true});
      this.updateRunningQuery(null);
    }
    render () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        const { type }     = this.props;
        const searchState = this._getSearchState(type);
        let results       = [];

        if (type === "text") {
          results = Sefaria.search.mergeTextResultsVersions(this.state.hits);
          results = results.filter(result => !!result._source.version).map(result =>
            <SearchTextResult
              data={result}
              query={this.props.query}
              key={result._id}
              searchInBook={this.props.searchInBook}
              onResultClick={this.props.onResultClick} />
          );
          if (this.state.topics.length > 0) {
              let topics = this.state.topics.map(t => {
                  Sefaria.track.event("Search", "topic in search display", t.analyticCat+"|"+t.title);
                  return <SearchTopic topic={t}/>
              });
              if (results.length > 0) {
                  topics = <div id="searchTopics">{topics}</div>
                  results.splice(2, 0, topics);
              }
              else {
                  results = topics;
              }
          }


        } else if (type === "sheet") {
          results = this.state.hits.map(result =>
            <SearchSheetResult
              data={result}
              query={this.props.query}
              key={result._id}
              onResultClick={this.props.onResultClick} />
          );
        }

        const loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        const noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);

        const queryFullyLoaded = !this.state.moreToLoad && !this.state.isQueryRunning;
        const haveResults      = !!results.length;
        results                = haveResults ? results : noResultsMessage;

        return (
          <div>
            <div className="searchTopMatter">
              {Sefaria.multiPanel && !this.props.compare ?
              <SearchSortBox
                type={this.props.type}
                updateAppliedOptionSort={this.props.updateAppliedOptionSort}
                sortType={searchState.sortType} />
              :
              <SearchFilterButton
                openMobileFilters={this.props.openMobileFilters}
                nFilters={searchState.appliedFilters.length} />}
            </div>
            <div className="searchResultList">
              { queryFullyLoaded || haveResults ? results : null }
              { this.state.isQueryRunning ? loadingMessage : null }
            </div>
          </div>
        );
    }
}
SearchResultList.propTypes = {
  query:                    PropTypes.string,
  type:                      PropTypes.oneOf(["text", "sheet"]),
  textSearchState:          PropTypes.object,
  sheetSearchState:         PropTypes.object,
  onResultClick:            PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func,
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


const SearchFilterButton = ({openMobileFilters, nFilters}) => (
  <div className={classNames({button: 1, extraSmall: 1, grey: !nFilters})} onClick={openMobileFilters}>
    <InterfaceText>Filter</InterfaceText>
    {!!nFilters ? <>&nbsp;({nFilters.toString()})</> : null}
  </div>
);


export default SearchResultList;
