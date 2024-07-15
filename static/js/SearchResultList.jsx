import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import Component from 'react-class';
import extend from 'extend';
import classNames from 'classnames';
import $ from './sefaria/sefariaJquery';
import Sefaria from './sefaria/sefaria';
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
    }
    componentDidMount() {
        $(ReactDOM.findDOMNode(this)).closest(".content").on("scroll.infiteScroll", this.handleScroll);
    }
    componentWillUnmount() {
        $(ReactDOM.findDOMNode(this)).closest(".content").off("scroll.infiniteScroll", this.handleScroll);
    }
    handleScroll() {
      if (!this.props.moreToLoad) { return; }
      if (this.props.isQueryRunning) { return; }

      var $scrollable = $(ReactDOM.findDOMNode(this)).closest(".content");
      var margin = 300;
      if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
        this.props.loadNextPage();
      }
    }
    render () {
        if (!(this.props.query)) {  // Push this up? Thought is to choose on the SearchPage level whether to show a ResultList or an EmptySearchMessage.
            return null;
        }

        const { type }     = this.props;
        let results       = [];

        if (type === "text") {
          results = Sefaria.search.mergeTextResultsVersions(this.props.hits);
          results = results.filter(result => !!result._source.version).map(result =>
            <SearchTextResult
              data={result}
              query={this.props.query}
              key={result._id}
              searchInBook={this.props.searchInBook}
              onResultClick={this.props.onResultClick} />
          );
          if (this.props.topics.length > 0) {
              let topics = this.props.topics.map(t => {
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
          results = this.props.hits.map((result, i) =>
            <SearchSheetResult
              hit={result}
              query={this.props.query}
              key={result._id}
              onResultClick={this.props.onResultClick} />
          );
        }

        const loadingMessage   = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);
        const noResultsMessage = (<LoadingMessage message="0 results." heMessage="0 תוצאות." />);
        const queryFullyLoaded = !this.props.moreToLoad && !this.props.isQueryRunning;
        const haveResults      = !!results.length;
        results                = haveResults ? results : noResultsMessage;

        return (
          <div>
              <div className="searchTopMatter">
                  {Sefaria.multiPanel && !this.props.compare ?
                      <SearchSortBox
                          type={type}
                          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
                          sortType={this.props.searchState.sortType}/>
                      :
                      <SearchFilterButton
                          openMobileFilters={this.props.openMobileFilters}
                          nFilters={this.props.searchState.appliedFilters.length}/>}
              </div>
              <div className="searchResultList">
                  {queryFullyLoaded || haveResults ? results : null}
                  {this.props.isQueryRunning ? loadingMessage : null}
              </div>
          </div>
        );
    }
}

SearchResultList.propTypes = {
    query: PropTypes.string,
    type: PropTypes.oneOf(["text", "sheet"]),
    searchState: PropTypes.object,
    onResultClick: PropTypes.func,
    updateAppliedOptionSort:  PropTypes.func,
    registerAvailableFilters: PropTypes.func,
    loadNextPage:             PropTypes.func,
    queryFullyLoaded: PropTypes.bool,
    isQueryRunning:   PropTypes.bool,
    topics:           PropTypes.array
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
    const filterTextClasses = classNames({searchFilterToggle: 1, active: isOpen});
    return (
        <DropdownModal close={() => {
            setIsOpen(false)
        }} isOpen={isOpen}>
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


export { SearchResultList };
