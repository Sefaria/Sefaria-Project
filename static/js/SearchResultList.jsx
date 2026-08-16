import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Component from 'react-class';
import extend from 'extend';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import SearchTextResult from './SearchTextResult';
import SearchSheetResult from './SearchSheetResult';
import SearchState from './sefaria/searchState';
import SearchResultCard from './SearchResultCard';
import InfiniteScroll from './InfiniteScroll';
import {
  DropdownModal,
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

// Pulls the matched words out of a hit's highlight field — Elasticsearch marks them
// with <b> tags. The reader re-highlights these same words after the panel opens, so
// clicking a result lands you on the words you actually searched for.
const getHighlightsFromHit = (data) => {
  if (!data.highlight) { return []; }
  const vals = Object.values(data.highlight);
  if (vals.length === 0) { return []; }
  const highlights = [];
  const highlightReg = /((?:[\s,.?!:;]){0,}<b>[^<]+<\/b>[\s,.?!:;]{0,})+/g;  // capture consecutive <b> tags in one match
  // vals should have only one entry, either 'naive_lemmatizer' or 'exact'
  for (const h of vals[0]) {
    let matches = null;
    while ((matches = highlightReg.exec(h)) !== null) {
      highlights.push(matches[0].replace(/<\/?b>/g, ''));
    }
  }
  return highlights;
};

// The reader files a version under 'he' or 'en' — not the version's own language, but
// the slot it occupies: 'he' for the primary text, 'en' for a translation. That slot
// decides which version the panel loads and what language it displays in
// (ReaderApp.jsx:100-102, ReaderApp.jsx:1573).
const getCurrVersionsFromHit = (source) => ({
  [source.isPrimary ? 'he' : 'en']: {
    languageFamilyName: source.languageFamilyName,
    versionTitle: source.version,
  },
});

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
    tref: s.ref,
    href,
    query,
    snippet,
    snippetLang,
    versionName: s.version,
    hebrewVersionName: s.hebrew_version_title,
    versions,
    // Carried through the click so the reader opens the version that matched and
    // highlights the matched words, instead of falling back to the default version.
    currVersions: getCurrVersionsFromHit(s),
    textHighlights: getHighlightsFromHit(hit),
  };
};








class SearchResultList extends Component {
    constructor(props) {
      super(props);
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

        const noResults = Sefaria._bilingual("search.no_results");
        const searching = Sefaria._bilingual("search.searching");
        const noResultsMessage = (<LoadingMessage message={noResults.en} heMessage={noResults.he} />);
        // "Searching..." only shows on an initial load with no results yet (e.g. sidebar
        // search-in-book, which renders this list directly without the page skeleton). Once
        // results exist, a running query is a scroll-triggered next page, so the shared
        // InfiniteScroll shows its "Loading more results..." message instead.
        const initialLoadingMessage = (<LoadingMessage message={searching.en} heMessage={searching.he} />);
        const haveResults      = !!results.length;

        return (
          <div>
              <InfiniteScroll
                  className="searchResultList"
                  hasMore={this.props.moreToLoad}
                  isLoading={this.props.isQueryRunning}
                  isLoadingMore={this.props.isQueryRunning && haveResults}
                  loadMore={this.props.loadNextPage}>
                  {haveResults ? results : null}
                  {!haveResults && this.props.isQueryRunning ? initialLoadingMessage : null}
                  {!haveResults && !this.props.isQueryRunning ? noResultsMessage : null}
              </InfiniteScroll>
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

const SearchSortBox = ({type, updateAppliedOptionSort, sortType, sortTypeArray, disabled}) => {
    const [isOpen, setIsOpen] = useState(false);
    const currentOption = (sortTypeArray || []).find(o => o.type === sortType) || (sortTypeArray || [])[0];
    const sortLabel = currentOption
      ? <InterfaceText text={{en: currentOption.name, he: currentOption.heName}} />
      : <InterfaceText>common.sort</InterfaceText>;

    if (disabled) {
      return (
        <div className="searchSortDropdown disabled" aria-disabled="true" tabIndex={-1}>
          <img className="searchSortDropdown__icon" src="/static/icons/sort.svg" alt="" aria-hidden="true" />
          <span className="searchSortDropdown__label">{sortLabel}</span>
          <img className="searchSortDropdown__chevron" src="/static/icons/chevron-down-line.svg" alt="" aria-hidden="true" />
        </div>
      );
    }

    const handleClick = (newSortType) => {
        if (sortType === newSortType) {
            return;
        }
        updateAppliedOptionSort(newSortType);
        setIsOpen(false);
    }
    const toggle = () => setIsOpen(prev => !prev);
    return (
        <DropdownModal close={() => setIsOpen(false)} isOpen={isOpen}>
          <button
            type="button"
            className={classNames('searchSortDropdown', { open: isOpen })}
            onClick={toggle}
            aria-haspopup="true"
            aria-expanded={isOpen}
          >
            <img className="searchSortDropdown__icon" src="/static/icons/sort.svg" alt="" aria-hidden="true" />
            <span className="searchSortDropdown__label">{sortLabel}</span>
            <img
              className="searchSortDropdown__chevron"
              src="/static/icons/chevron-down-line.svg"
              alt=""
              aria-hidden="true"
            />
          </button>
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
  disabled:                PropTypes.bool,
};


const SearchFilterButton = ({openMobileFilters, nFilters, disabled, label = "Filter"}) => {
  const isGrey = (label === "Filter" && !nFilters) || disabled;
  const ariaLabel = disabled
    ? undefined
    : `Open ${label.toLowerCase()}${label === "Filter" && nFilters ? ` (${nFilters} active)` : ''}`;
  return (
    <div
      className={classNames({button: 1, extraSmall: 1, grey: isGrey, disabled})}
      onClick={disabled ? undefined : openMobileFilters}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      <InterfaceText>common.filter</InterfaceText>
      {label === "Filter" && !!nFilters ? <>&nbsp;({nFilters.toString()})</> : null}
    </div>
  );
};


const MobileFilterIconButton = ({ openMobileFilters, disabled }) => (
  <div
    className={classNames("mobileFilterIconButton", { disabled })}
    onClick={disabled ? undefined : openMobileFilters}
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-label={disabled ? undefined : Sefaria._("search.sort.aria")}
    aria-disabled={disabled || undefined}
    onKeyDown={disabled ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMobileFilters(); } }}
  >
    <img src="/static/icons/sliders-horizontal.svg" alt="" aria-hidden="true" />
  </div>
);


export { SearchResultList, SearchFilterButton, MobileFilterIconButton, SearchSortBox };
