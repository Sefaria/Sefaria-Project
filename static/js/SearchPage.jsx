import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import ComparePanelHeader from './ComparePanelHeader';
import SearchFilters, {BookSearchFilters, EntitySortPanel} from './SearchFilters';
import FilterNode from './sefaria/FilterNode';
import Component from 'react-class';
import {MobileFilterIconButton} from './SearchResultList';
import {SearchResultList} from "./SearchResultList";
import SearchSortDropdown, {ENTITY_SORT_OPTIONS, sortEntityHits} from './SearchSortDropdown';
import SearchResultCard from './SearchResultCard';
import {
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
  TabView,
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
    let hits = sortEntityHits(data.hits, type, sortKey);
    if (type === 'book') {
      const selectedCategories = this.state.bookCategoryFilters
        .filter(f => f.isSelected())
        .map(f => f.aggKey);
      if (selectedCategories.length > 0) {
        hits = hits.filter(hit => hit.categories && selectedCategories.includes(hit.categories[0]));
      }
    }
    return {...data, hits};
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

  setTab(tab, replaceHistory) {
    // The active tab lives in panel state (this.props.tab) so it is serialized
    // into the URL and history; back/forward restores it via handlePopState.
    this.setState({mobileFiltersOpen: false});
    this.props.setTab(tab, replaceHistory);
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
      <MobileFilterIconButton
          openMobileFilters={() => this.setState({mobileFiltersOpen: true})}/>;

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
        <SearchToggle
          options={[
            {name: "all",   en: "All results",  he: "כל התוצאות"},
            {name: "exact", en: "Exact phrase", he: "מונח מדויק"},
          ]}
          selected={isExactSearch ? "exact" : "all"}
          onChange={handleExactMatchChange}
        />
      </div>
    ) : null;

    if (this.props.searchInBook) {
      return searchResultList;
    }

    const isValidTab = ["sources", "books", "authors", "topics"].includes(this.props.tab);
    const activeTab = isValidTab ? this.props.tab : "sources";
    const closeMobileFilters = () => this.setState({mobileFiltersOpen: false});
    const selectedBookFilterCount = this.state.bookCategoryFilters.filter(f => f.isSelected()).length;

    // Sidebar rule: Sources keeps the existing filters, Books gets a searchable
    // category list, Authors/Topics get a sort-only panel on mobile.
    let sidebar = null;
    if (activeTab === "sources" && this.props.totalResults?.getValue() > 0) {
      sidebar = <SearchFilters
          query={this.props.query}
          searchState={this.props.searchState}
          updateAppliedFilter={this.props.updateAppliedFilter.bind(null, this.props.searchState)}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          topSection={searchTypeSection}
          closeMobileFilters={closeMobileFilters}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (activeTab === "books") {
      sidebar = <BookSearchFilters
          filters={this.state.bookCategoryFilters}
          updateSelected={this.toggleBookCategoryFilter}
          mobileSortProps={!Sefaria.multiPanel ? {
            sortOptions: ENTITY_SORT_OPTIONS.books,
            sortType: this.state.entitySort.book,
            onSortChange: (key) => this.setEntitySort('book', key),
            onClose: closeMobileFilters,
          } : null}
      />;
    } else if (!Sefaria.multiPanel) {
      if (activeTab === "authors") {
        sidebar = <EntitySortPanel
            sortOptions={ENTITY_SORT_OPTIONS.authors}
            sortType={this.state.entitySort.author}
            onSortChange={(key) => this.setEntitySort('author', key)}
            onClose={closeMobileFilters}
        />;
      } else if (activeTab === "topics") {
        sidebar = <EntitySortPanel
            sortOptions={ENTITY_SORT_OPTIONS.topics}
            sortType={this.state.entitySort.topic}
            onSortChange={(key) => this.setEntitySort('topic', key)}
            onClose={closeMobileFilters}
        />;
      }
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
          {Sefaria.multiPanel
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.books}
                sortType={this.state.entitySort.book}
                onSortChange={(key) => this.setEntitySort('book', key)}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
              />
          }
        </div>
        <EntitySearchResults type="book" data={this.getSortedEntityData('book')} query={this.props.query}/>
      </div>,
      <div className="searchTabPanel" key="authors">
        <div className="searchSortBar">
          {Sefaria.multiPanel
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.authors}
                sortType={this.state.entitySort.author}
                onSortChange={(key) => this.setEntitySort('author', key)}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
              />
          }
        </div>
        <EntitySearchResults type="author" data={this.getSortedEntityData('author')} query={this.props.query}/>
      </div>,
      <div className="searchTabPanel" key="topics">
        <div className="searchSortBar">
          {Sefaria.multiPanel
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.topics}
                sortType={this.state.entitySort.topic}
                onSortChange={(key) => this.setEntitySort('topic', key)}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
              />
          }
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
                          currTabName={isValidTab ? this.props.tab : null}
                          setTab={this.setTab}
                          renderTab={this.renderTab}
                          containerClasses={"largeTabs"}>
                        {tabPanels}
                      </TabView>
                    : <>
                        <SearchTabsMobileWeb
                            tabs={tabs}
                            currTabName={activeTab}
                            setTab={this.setTab}/>
                        {tabPanels[tabs.findIndex(t => t.id === activeTab)]}
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
  tab:                      PropTypes.string,
  setTab:                   PropTypes.func,
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
