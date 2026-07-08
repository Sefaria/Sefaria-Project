import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import ComparePanelHeader from './ComparePanelHeader';
import SearchFilters, {BookSearchFilters} from './SearchFilters';
import FilterNode from './sefaria/FilterNode';
import Component from 'react-class';
import {SearchSortBox, SearchFilterButton} from './SearchResultList';
import {SearchResultList} from "./SearchResultList";
import {
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
  TabView,
} from './Misc';


const SearchPageSearchBar = ({query, onQueryChange}) => {
  const [value, setValue] = React.useState(query || "");

  const submit = () => {
    const newQuery = value.trim();
    if (newQuery.length && newQuery !== query) {
      onQueryChange(newQuery);
    }
  };

  return (
    <div className="searchPageSearchBar" role="search">
      <img
          className="searchIcon"
          src="/static/icons/search_mdl.svg"
          alt={Sefaria._("Search")}
          onClick={submit}
      />
      <input
          type="text"
          className="serif"
          value={value}
          placeholder={Sefaria._("Search")}
          aria-label={Sefaria._("Search for Texts or Keywords Here")}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { submit(); } }}
          maxLength={75}
      />
      {value.length ?
          <img
              className="searchBarClearButton"
              src="/static/icons/heavy-x.svg"
              alt={Sefaria._("Clear")}
              role="button"
              onClick={() => setValue("")}
          /> : null}
    </div>
  );
};


class SearchPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      totalResults: null,
      mobileFiltersOpen: false,
      activeTab: "sources",
      entityCounts: {topic: null, author: null, book: null},
      bookCategoryFilters: this.makeBookCategoryFilters(),
    };
  }

  makeBookCategoryFilters() {
    return Sefaria.toc.map(cat => new FilterNode({
      title: cat.category,
      heTitle: cat.heCategory,
      aggKey: cat.category,
      aggType: "categories",
    }));
  }

  toggleBookCategoryFilter(filter) {
    filter.isSelected() ? filter.setUnselected(true) : filter.setSelected(true);
    this.setState({bookCategoryFilters: [...this.state.bookCategoryFilters]});
  }

  componentDidMount() {
    this.fetchEntityCounts();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.query !== this.props.query) {
      this.setState({entityCounts: {topic: null, author: null, book: null}});
      this.fetchEntityCounts();
    }
  }

  fetchEntityCounts() {
    const query = this.props.query;
    if (!query || this.props.searchInBook) { return; }
    ["topic", "author", "book"].forEach(type => {
      Sefaria.search.entitySearchCount(query, type)
          .then(total => {
            if (this.props.query !== query) { return; }  // a newer query superseded this one
            this.setState(prev => ({entityCounts: {...prev.entityCounts, [type]: total}}));
          })
          .catch(() => {});  // count badge stays at "0"
    });
  }

  formatEntityCount(count) {
    if (count === null || count === undefined) { return "0"; }
    return count >= 10000 ? "10,000+" : count.addCommas();
  }

  setTab(tab) {
    this.setState({activeTab: tab, mobileFiltersOpen: false});
  }

  renderTab(tab) {
    return (
      <div className="tab">
        <InterfaceText>{tab.title}</InterfaceText>
        <span className="searchTabCount">{tab.count}</span>
      </div>
    );
  }

  render () {
    const classes = classNames({readerNavMenu: 1, compare: this.props.compare});
    const searchResultList = <SearchResultList
        query={this.props.query}
        hits={this.props.hits}
        type={this.props.type}
        compare={this.props.compare}
        searchState={this.props.searchState}
        onResultClick={this.props.onResultClick}
        updateAppliedOptionSort={this.props.updateAppliedOptionSort}
        registerAvailableFilters={this.props.registerAvailableFilters}
        loadNextPage={this.props.loadNextPage}
        isQueryRunning={this.props.isQueryRunning}
        moreToLoad={this.props.moreToLoad}
        topics={this.props.topics}
    />;

    const resultCount = this.props.totalResults?.getValue() > 0 && (
      <>
        <InterfaceText>{this.props.totalResults.asString()}</InterfaceText>&nbsp;
        <InterfaceText>Results</InterfaceText>
      </>
    );

    const sortFilterControls = Sefaria.multiPanel && !this.props.compare ?
      <SearchSortBox
          type={this.props.type}
          sortTypeArray={this.props.sortTypeArray}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          sortType={this.props.searchState.sortType}/>
      :
      <SearchFilterButton
          openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
          nFilters={this.props.searchState.appliedFilters.length}/>;

    if (this.props.searchInBook) {
      return searchResultList;
    }

    // Sidebar rule: Sources keeps the existing filters, Books gets a searchable
    // category list, Topics and Authors get no sidebar.
    let sidebar = null;
    if (this.state.activeTab === "sources" && this.props.totalResults?.getValue() > 0) {
      sidebar = <SearchFilters
          query={this.props.query}
          searchState={this.props.searchState}
          updateAppliedFilter={this.props.updateAppliedFilter.bind(null, this.props.searchState)}
          updateAppliedOptionField={this.props.updateAppliedOptionField}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          closeMobileFilters={() => this.setState({mobileFiltersOpen: false})}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (this.state.activeTab === "books") {
      sidebar = <BookSearchFilters
          filters={this.state.bookCategoryFilters}
          updateSelected={this.toggleBookCategoryFilter}/>;
    }

    const tabs = [
      {id: "sources", title: "Sources", count: this.props.totalResults?.asString() || "0"},
      {id: "books",   title: "Books",   count: this.formatEntityCount(this.state.entityCounts.book)},
      {id: "authors", title: "Authors", count: this.formatEntityCount(this.state.entityCounts.author)},
      {id: "topics",  title: "Topics",  count: this.formatEntityCount(this.state.entityCounts.topic)},
    ];

    return (
        <div className={classes} key={this.props.query}>
          {this.props.compare ?
              <ComparePanelHeader
                  search={true}
                  showDisplaySettings={false}
                  onBack={this.props.close}
                  openSearch={this.props.onQueryChange}/> : null}

          <div className="content searchContent">
            <div className="sidebarLayout">
              <div className="contentInner">

                <div className="searchTopLine">
                  <SearchPageSearchBar
                      query={this.props.query}
                      onQueryChange={this.props.onQueryChange}/>
                </div>

                <TabView
                    tabs={tabs}
                    currTabName={this.state.activeTab}
                    setTab={this.setTab}
                    renderTab={this.renderTab}
                    containerClasses={"largeTabs"}>
                  <div className="searchTabPanel" key="sources">
                    <div className="searchTopMatter">
                      <div className="searchResultCount">
                        {resultCount}
                      </div>
                      <div>
                        {sortFilterControls}
                      </div>
                    </div>
                    {/* Search results temporarily removed while the page is rebuilt
                        to match the multi-entity search designs (sc-45480).
                    {searchResultList}
                    */}
                  </div>
                  <div className="searchTabPanel" key="books"></div>
                  <div className="searchTabPanel" key="authors"></div>
                  <div className="searchTabPanel" key="topics"></div>
                </TabView>
              </div>

              {Sefaria.multiPanel && !this.props.compare ?
                  <div className="navSidebar">
                    {sidebar}
                  </div>
                  : this.state.mobileFiltersOpen && sidebar ?
                      <div className="mobileSearchFilters">
                        {sidebar}
                      </div>
                      : null}
            </div>
          </div>
        </div>
    );
  }
}

SearchPage.propTypes = {
  query:                    PropTypes.string,
  type:                      PropTypes.oneOf(["text", "sheet"]),
  searchState:              PropTypes.object,
  settings:                 PropTypes.object,
  panelsOpen:               PropTypes.number,
  close:                    PropTypes.func,
  onResultClick:            PropTypes.func,
  onQueryChange:            PropTypes.func,
  updateAppliedFilter:      PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  registerAvailableFilters: PropTypes.func,
  loadNextPage:             PropTypes.func,
  moreToLoad:               PropTypes.bool,
  topics:                   PropTypes.array,
  totalResults:             PropTypes.object,
  sortTypeArray:            PropTypes.array,
};


export default SearchPage;
