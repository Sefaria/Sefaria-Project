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
import SearchState from './sefaria/searchState';
import SearchResultCard from './SearchResultCard';
import {
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  InterfaceText,
  LoadingMessage,
} from './Misc';


const getSnippetFromHit = (data) => {
  if (data.highlight) {
    const field = Object.keys(data.highlight)[0];
    let snippet = data.highlight[field].join('...');
    snippet = snippet.replace(/^[ .,;:!-)\]]+/, '');
    return snippet;
  }
  return data._source.exact || '';
};

const sourceHitCardProps = (hit, query) => {
  const s = hit._source;
  const snippet = getSnippetFromHit(hit);
  const snippetLang = Sefaria.hebrew.isHebrew(snippet) ? 'he' : 'en';
  const href = `/${Sefaria.normRef(s.ref)}?v${s.lang}=${Sefaria.util.encodeVtitle(s.version)}&qh=${query}`;

  const versions = (hit.duplicates || [])
    .filter(d => !!d._source.version)
    .map(d => {
      const dSnippet = getSnippetFromHit(d);
      return {
        snippet: dSnippet,
        snippetLang: Sefaria.hebrew.isHebrew(dSnippet) ? 'he' : 'en',
        versionName: d._source.version,
        hebrewVersionName: d._source.hebrew_version_title,
        href: `/${Sefaria.normRef(d._source.ref)}?v${d._source.lang}=${Sefaria.util.encodeVtitle(d._source.version)}&qh=${query}`,
      };
    });

  return {
    mode: 'sources',
    type: 'text',
    name: s.ref,
    hebrewName: s.heRef,
    href,
    query,
    snippet,
    snippetLang,
    versionName: s.version,
    hebrewVersionName: s.hebrew_version_title,
    versions,
  };
};








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
            this.props.searchInBook
              ? <SearchTextResult
                  data={result}
                  query={this.props.query}
                  key={result._id}
                  searchInBook={this.props.searchInBook}
                  onResultClick={this.props.onResultClick} />
              : <SearchResultCard
                  key={result._id}
                  {...sourceHitCardProps(result, this.props.query)}
                  onResultClick={this.props.onResultClick} />
          );


        } else if (type === "sheet") {
          results = this.props.hits.map((result, i) =>
            <SearchSheetResult
              metadata={result}
              snippet={result.snippet}
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
};

const SearchSortBox = ({type, updateAppliedOptionSort, sortType, sortTypeArray}) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = (newSortType) => {
        if (sortType === newSortType) {
            return;
        }
        updateAppliedOptionSort(newSortType);
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
        options={sortTypeArray}
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


const SearchFilterButton = ({openMobileFilters, nFilters, label = "Filter"}) => (
  <div className={classNames({button: 1, extraSmall: 1, grey: label === "Filter" ? !nFilters : false})}
       onClick={openMobileFilters}
       role="button"
       tabIndex="0"
       aria-label={`Open ${label.toLowerCase()}${label === "Filter" && nFilters ? ` (${nFilters} active)` : ''}`}>
    <InterfaceText>{label}</InterfaceText>
    {label === "Filter" && !!nFilters ? <>&nbsp;({nFilters.toString()})</> : null}
  </div>
);


const MobileFilterIconButton = ({ openMobileFilters }) => (
  <div
    className="mobileFilterIconButton"
    onClick={openMobileFilters}
    role="button"
    tabIndex="0"
    aria-label={Sefaria._("Filter and Sort")}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMobileFilters(); } }}
  >
    <img src="/static/icons/sliders.svg" alt="" aria-hidden="true" />
  </div>
);


export { SearchResultList, SearchFilterButton, MobileFilterIconButton, SearchSortBox };
