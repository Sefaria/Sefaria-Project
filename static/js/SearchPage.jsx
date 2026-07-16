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
import {SearchFilterButton} from './SearchResultList';
import {SearchResultList} from "./SearchResultList";
import SearchSortDropdown, {ENTITY_SORT_OPTIONS, sortEntityHits} from './SearchSortDropdown';
import SearchResultCard from './SearchResultCard';
import {
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
  TabView,
  ToggleSet,
} from './Misc';
import SearchLoadSkeleton from './SearchLoadSkeleton';
import SearchToggle from './SearchToggle';
import SearchTabsMobileWeb from './SearchTabsMobileWeb';


const SearchPageSearchBar = ({query, onQueryChange}) => {
  const [value, setValue] = React.useState(query || "");
  React.useEffect(() => { setValue(query || ""); }, [query]);
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
          role="button"
          tabIndex="0"
          onClick={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              submit();
            }
          }}
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
              tabIndex="0"
              onClick={() => setValue("")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setValue("");
                }
              }}
          /> : null}
    </div>
  );
};


const formatEntityYear = (year) => {
  if (year === null || year === undefined) { return null; }
  const abs = Math.abs(year);
  return year < 0
      ? {en: `${abs} BCE`, he: `${abs} לפנה״ס`}
      : {en: `${abs} CE`, he: `${abs} לספירה`};
};


const authorLifespan = (hit) => {
  const {birthYear, deathYear} = hit;
  if (birthYear == null || deathYear == null) {
    return formatEntityYear(birthYear ?? deathYear);
  }
  const birth = formatEntityYear(birthYear);
  const death = formatEntityYear(deathYear);
  if ((birthYear < 0) === (deathYear < 0)) {
    // Same era — spell it out once: "1135 – 1204 CE", not "1135 CE – 1204 CE".
    return {en: `${Math.abs(birthYear)} – ${death.en}`, he: `${Math.abs(birthYear)} – ${death.he}`};
  }
  return {en: `${birth.en} – ${death.en}`, he: `${birth.he} – ${death.he}`};
};


const topicHitCardProps = (hit, query) => ({
  mode: 'topics',
  type: 'topic',
  name: hit.title_en || hit.title_he,
  hebrewName: hit.title_he || hit.title_en,
  description: hit.description_en,
  hebrewDescription: hit.description_he,
  href: `/topics/${hit.slug}`,
  query,
});


const authorHitCardProps = (hit, query) => {
  const lifespan = authorLifespan(hit);
  return {
    ...topicHitCardProps(hit, query),  // authors are topics: same slug-based href and title/description fields
    mode: 'authors',
    type: 'author',
    secondaryDate: lifespan?.en,
    hebrewSecondaryDate: lifespan?.he,
  };
};


const categoryPathCrumbs = (categories) => categories.map((cat, i) => ({
  label: cat,
  hebrewLabel: Sefaria.hebrewTerm(cat),
  href: `/texts/${categories.slice(0, i + 1).join("/")}`,
}));


const bookHitCardProps = (hit, query) => {
  const date = formatEntityYear(hit.compDate);
  const common = {
    mode: 'books',
    name: hit.title_en || hit.title_he,
    hebrewName: hit.title_he || hit.title_en,
    secondaryDate: date?.en,
    hebrewSecondaryDate: date?.he,
    description: hit.description_en,
    hebrewDescription: hit.description_he,
    query,
  };
  if (hit.url) {
    // An author-works aggregation row (see entity_search): it carries its own url.
    // An individual work carries its category path; a category row collapses many
    // works (and paths) into one entry, so it's represented by its own label instead.
    return {
      ...common,
      type: hit.isCategory ? 'collection' : 'text',
      href: hit.url,
      crumbs: hit.categories?.length
        ? categoryPathCrumbs(hit.categories)
        : hit.categoryLabel_en ? [{label: hit.categoryLabel_en, hebrewLabel: hit.categoryLabel_he}] : undefined,
    };
  }
  return {
    ...common,
    type: 'text',
    href: `/${hit.title_en.replace(/ /g, "_").replace(/\?/g, "%3F")}`,
    crumbs: categoryPathCrumbs(hit.categories || []),
    secondaryAuthor: hit.author_names?.[0],
  };
};


const ENTITY_CARD_PROP_BUILDERS = {
  topic: topicHitCardProps,
  author: authorHitCardProps,
  book: bookHitCardProps,
};


const EntitySearchResults = ({type, data, query}) => {
  if (!data) {
    return <LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />;
  }
  if (!data.hits.length) {
    return <LoadingMessage message="0 results." heMessage="0 תוצאות." />;
  }
  return (
    <div className="entitySearchResults">
      {data.hits.map(hit => {
        const cardProps = ENTITY_CARD_PROP_BUILDERS[type](hit, query);
        return <SearchResultCard key={cardProps.href} {...cardProps} />;
      })}
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
      entityData: {topic: null, author: null, book: null},  // full {hits, total} response per type
      entitySort: {book: 'relevance', author: 'relevance', topic: 'relevance'},
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

  setEntitySort(type, sortKey) {
    this.setState(prev => ({entitySort: {...prev.entitySort, [type]: sortKey}}));
  }

  getSortedEntityData(type) {
    const data = this.state.entityData[type];
    if (!data) return null;
    const sortKey = this.state.entitySort[type];
    return {...data, hits: sortEntityHits(data.hits, type, sortKey)};
  }

  toggleBookCategoryFilter(filter) {
    filter.isSelected() ? filter.setUnselected(true) : filter.setSelected(true);
    this.setState({bookCategoryFilters: [...this.state.bookCategoryFilters]});
  }

  componentDidMount() {
    this.fetchEntityResults();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.query !== this.props.query) {
      this.setState({entityData: {topic: null, author: null, book: null}});
      this.fetchEntityResults();
    }
  }

  fetchEntityResults() {
    const query = this.props.query;
    if (!query || this.props.searchInBook) { return; }
    ["topic", "author", "book"].forEach(type => {
      Sefaria.search.entitySearch(query, type)
          .then(data => {
            if (this.props.query !== query) { return; }  // a newer query superseded this one
            this.setState(prev => ({entityData: {...prev.entityData, [type]: data}}));
          })
          .catch(() => {});  // count badge stays at "0", panel stays on the loading message
    });
  }

  formatEntityCount(count) {
    if (count === null || count === undefined) { return ""; }
    return count >= 10000 ? "10,000+" : count.addCommas();
  }

  setTab(tab) {
    this.setState({activeTab: tab, mobileFiltersOpen: false});
  }

  renderTab(tab) {
    return (
      <div className="tab">
        <InterfaceText>{tab.title}</InterfaceText>
        {tab.count != null && <span className="searchTabCount">{tab.count}</span>}
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

    const sortFilterControls = Sefaria.multiPanel && !this.props.compare ?
      <SearchSortDropdown
          options={this.props.sortTypeArray}
          sortType={this.props.searchState.sortType}
          onSortChange={this.props.updateAppliedOptionSort}/>
      :
      <SearchFilterButton
          openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
          nFilters={this.props.searchState.appliedFilters.length}/>;

    const isExactSearch = this.props.type === "text"
      && this.props.searchState.field === this.props.searchState.fieldExact;
    const handleExactMatchChange = (name) => {
      this.props.updateAppliedOptionField(
        name === "exact" ? this.props.searchState.fieldExact : this.props.searchState.fieldBroad
      );
    };
    const searchTypeSection = this.props.type === "text" ? (
      <div className="searchFilterGroup">
        <h2><InterfaceText>Search Type</InterfaceText></h2>
        <ToggleSet
          ariaLabel={Sefaria._("Search Type")}
          name="searchType"
          options={[
            {name: "all",   content: <InterfaceText text={{en: "All results",  he: "כל התוצאות"}} />, role: "radio", ariaLabel: Sefaria._("All results")},
            {name: "exact", content: <InterfaceText text={{en: "Exact phrase", he: "מונח מדויק"}}  />, role: "radio", ariaLabel: Sefaria._("Exact phrase")},
          ]}
          setOption={(set, name) => handleExactMatchChange(name)}
          currentValue={isExactSearch ? "exact" : "all"}
          blueStyle={true}
        />
      </div>
    ) : null;

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
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          topSection={searchTypeSection}
          closeMobileFilters={() => this.setState({mobileFiltersOpen: false})}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (this.state.activeTab === "books") {
      sidebar = <BookSearchFilters
          filters={this.state.bookCategoryFilters}
          updateSelected={this.toggleBookCategoryFilter}/>;
    }

    const tabs = [
      {id: "sources", title: "Sources", count: this.props.totalResults?.asString() || ""},
      {id: "books",   title: "Books",   count: this.formatEntityCount(this.state.entityData.book?.total)},
      {id: "authors", title: "Authors", count: this.formatEntityCount(this.state.entityData.author?.total)},
      {id: "topics",  title: "Topics",  count: this.formatEntityCount(this.state.entityData.topic?.total)},
    ];

    const tabPanels = [
      <div className="searchTabPanel" key="sources">
        <div className="searchTopMatter">
          {Sefaria.multiPanel && !this.props.compare && this.props.type === "text" && (
            <SearchToggle
              options={[
                {name: "all",   en: "All results",  he: "כל התוצאות"},
                {name: "exact", en: "Exact phrase", he: "מונח מדויק"},
              ]}
              selected={isExactSearch ? "exact" : "all"}
              onChange={handleExactMatchChange}
            />
          )}
          <div>
            {sortFilterControls}
          </div>
        </div>
        {searchResultList}
      </div>,
      <div className="searchTabPanel" key="books">
        <div className="searchSortBar">
          <SearchSortDropdown
            options={ENTITY_SORT_OPTIONS.books}
            sortType={this.state.entitySort.book}
            onSortChange={(key) => this.setEntitySort('book', key)}
          />
        </div>
        <EntitySearchResults type="book" data={this.getSortedEntityData('book')} query={this.props.query}/>
      </div>,
      <div className="searchTabPanel" key="authors">
        <div className="searchSortBar">
          <SearchSortDropdown
            options={ENTITY_SORT_OPTIONS.authors}
            sortType={this.state.entitySort.author}
            onSortChange={(key) => this.setEntitySort('author', key)}
          />
        </div>
        <EntitySearchResults type="author" data={this.getSortedEntityData('author')} query={this.props.query}/>
      </div>,
      <div className="searchTabPanel" key="topics">
        <div className="searchSortBar">
          <SearchSortDropdown
            options={ENTITY_SORT_OPTIONS.topics}
            sortType={this.state.entitySort.topic}
            onSortChange={(key) => this.setEntitySort('topic', key)}
          />
        </div>
        <EntitySearchResults type="topic" data={this.getSortedEntityData('topic')} query={this.props.query}/>
      </div>,
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

                {this.props.isQueryRunning
                  ? <SearchLoadSkeleton />
                  : Sefaria.multiPanel
                    ? <TabView
                          tabs={tabs}
                          currTabName={this.state.activeTab}
                          setTab={this.setTab}
                          renderTab={this.renderTab}
                          containerClasses={"largeTabs"}>
                        {tabPanels}
                      </TabView>
                    : <>
                        <SearchTabsMobileWeb
                            tabs={tabs}
                            currTabName={this.state.activeTab}
                            setTab={this.setTab}/>
                        {tabPanels[tabs.findIndex(t => t.id === this.state.activeTab)]}
                      </>
                }
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
