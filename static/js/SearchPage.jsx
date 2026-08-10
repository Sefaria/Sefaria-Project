import React  from 'react';
import ReactDOM  from 'react-dom';
import $  from './sefaria/sefariaJquery';
import Sefaria  from './sefaria/sefaria';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import ComparePanelHeader from './ComparePanelHeader';
import SearchFilters, {BookSearchFilters, EntitySortPanel} from './SearchFilters';
import FilterNode from './sefaria/FilterNode';
import SearchState from './sefaria/searchState';
import Component from 'react-class';
import {MobileFilterIconButton, SearchSortBox, SearchFilterButton} from './SearchResultList';
import {SearchResultList} from "./SearchResultList";
import SearchSortDropdown, {ENTITY_SORT_OPTIONS, sortEntityHits} from './SearchSortDropdown';
import SearchResultCard from './SearchResultCard';
import InfiniteScroll from './InfiniteScroll';
import NoSearchResults from './NoSearchResults';
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
          alt={Sefaria._("common.search")}
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
          placeholder={Sefaria._("common.search")}
          aria-label={Sefaria._("common.search_for_texts_or_keywords_here")}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { submit(); } }}
          maxLength={75}
      />
      {value.length ?
          <img
              className="searchBarClearButton"
              src="/static/icons/heavy-x.svg"
              alt={Sefaria._("common.clear")}
              role="button"
              tabIndex="0"
              onClick={() => setValue("")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setValue("");
                }
              }}
          /> : null }
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


const topicHitCardProps = (hit, query) => {
  const parentCategory = Sefaria.displayTopicTocCategory(hit.slug);
  return {
    mode: 'topics',
    type: 'topic',
    name: hit.title_en || hit.title_he,
    hebrewName: hit.title_he || hit.title_en,
    description: hit.description_en,
    hebrewDescription: hit.description_he,
    href: `/topics/${hit.slug}`,
    query,
    crumbs: parentCategory
      ? [{ label: parentCategory.en, hebrewLabel: parentCategory.he, href: `/topics/category/${parentCategory.slug}` }]
      : undefined,
  };
};


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
  const authorNames = hit.author_names || [];
  const isHebrew = s => /[֐-׿]/.test(s);
  return {
    ...common,
    type: 'text',
    href: `/${hit.title_en.replace(/ /g, "_").replace(/\?/g, "%3F")}`,
    crumbs: categoryPathCrumbs(hit.categories || []),
    secondaryAuthor: authorNames.find(n => !isHebrew(n)) || authorNames[0],
    hebrewSecondaryAuthor: authorNames.find(isHebrew),
    secondaryAuthorHref: hit.authors?.[0] ? `/topics/${hit.authors[0]}?tab=author-works-on-sefaria` : undefined,
  };
};


const ENTITY_CARD_PROP_BUILDERS = {
  topic: topicHitCardProps,
  author: authorHitCardProps,
  book: bookHitCardProps,
};


const EntitySearchResults = ({type, data, query, loadMore}) => {
  if (!data) {
    return <LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />;
  }
  if (!data.hits.length) {
    return <NoSearchResults mode={type + 's'} query={query} />;
  }
  return (
    <InfiniteScroll
      className="entitySearchResults"
      hasMore={data.moreToLoad}
      isLoading={data.isLoadingMore}
      isLoadingMore={data.isLoadingMore}
      loadMore={loadMore}>
      {data.hits.map(hit => {
        const cardProps = ENTITY_CARD_PROP_BUILDERS[type](hit, query);
        return <SearchResultCard key={cardProps.href} {...cardProps} />;
      })}
    </InfiniteScroll>
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
      useDesktopTabs: window.innerWidth > 985,
    };
    this._onResize = () => {
      const next = window.innerWidth > 985;
      if (next !== this.state.useDesktopTabs) this.setState({useDesktopTabs: next});
    };
  }

  makeBookCategoryFilters() {
    return Sefaria.toc.map(cat => {
      const node = new FilterNode({
        title: cat.category,
        heTitle: cat.heCategory,
        aggKey: cat.category,
        aggType: "categories",
      });
      (cat.contents || [])
        .filter(sub => sub.category)
        .forEach(sub => {
          node.append(new FilterNode({
            title: sub.category,
            heTitle: sub.heCategory,
            aggKey: `${cat.category}/${sub.category}`,
            aggType: "categories",
          }));
        });
      return node;
    });
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
      const selectedKeys = [];
      const collectSelected = (filterList) => {
        filterList.forEach(f => {
          if (f.isSelected()) {
            selectedKeys.push(f.aggKey);
          } else if (f.isPartial()) {
            collectSelected(f.children);
          }
        });
      };
      collectSelected(this.state.bookCategoryFilters);
      if (selectedKeys.length > 0) {
        hits = hits.filter(hit => {
          if (!hit.categories) return false;
          const path = hit.categories.join("/");
          return selectedKeys.some(key => path === key || path.startsWith(key + "/"));
        });
      }
    }
    return {...data, hits};
  }

  hasEntityResults(type) {
    return !!this.getSortedEntityData(type)?.hits?.length;
  }

  toggleBookCategoryFilter(filter) {
    filter.isSelected() ? filter.setUnselected(true) : filter.setSelected(true);
    this.setState({bookCategoryFilters: [...this.state.bookCategoryFilters]});
  }

  componentDidMount() {
    this.fetchEntityResults();
    window.addEventListener('resize', this._onResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.query !== this.props.query) {
      this.setState({entityData: {topic: null, author: null, book: null}, bookCategoryFilters: this.makeBookCategoryFilters()});
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
            this.setState(prev => ({entityData: {...prev.entityData, [type]: this.makeEntityEntry(data)}}));
          })
          .catch(() => {});  // count badge stays at "0", panel stays on the loading message
    });
  }

  // Normalize an API page into the paging entry the tab panels read. `total` is the full
  // match count (so the badge and "more to load" stay correct), `moreToLoad` compares it to
  // how many hits we've accumulated so far.
  makeEntityEntry(data, prevHits = []) {
    const hits = prevHits.concat(data.hits);
    // Cap at ES's default max_result_window so infinite scroll stops before sending an offset
    // that ES would reject. `total` is kept intact for the count badge.
    const loadableTotal = Math.min(data.total, 10000);
    return {hits, total: data.total, moreToLoad: hits.length < loadableTotal, isLoadingMore: false};
  }

  loadNextEntityPage(type) {
    const query = this.props.query;
    const cur = this.state.entityData[type];
    if (!cur || cur.isLoadingMore || !cur.moreToLoad) { return; }
    this.setState(prev => ({
      entityData: {...prev.entityData, [type]: {...prev.entityData[type], isLoadingMore: true}},
    }));
    Sefaria.search.entitySearch(query, type, cur.hits.length)
        .then(data => {
          if (this.props.query !== query) { return; }  // a newer query superseded this one
          this.setState(prev => {
            const prevEntry = prev.entityData[type];
            if (!prevEntry) { return null; }  // query was reset while this page was in flight
            return {entityData: {...prev.entityData, [type]: this.makeEntityEntry(data, prevEntry.hits)}};
          });
        })
        .catch(() => {
          this.setState(prev => {
            const prevEntry = prev.entityData[type];
            if (!prevEntry) { return null; }
            return {entityData: {...prev.entityData, [type]: {...prevEntry, isLoadingMore: false}}};
          });
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
    const useDesktopTabs = Sefaria.multiPanel && this.state.useDesktopTabs;
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

    const makeSortFilterControls = (disabled = false) =>
      useDesktopTabs && !this.props.compare
        ? <SearchSortBox
              type={this.props.type}
              sortTypeArray={this.props.sortTypeArray}
              updateAppliedOptionSort={this.props.updateAppliedOptionSort}
              sortType={this.props.searchState.sortType}
              disabled={disabled} />
        : <SearchFilterButton
              openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
              nFilters={this.props.searchState.appliedFilters.length}
              disabled={disabled} />;

    if (this.props.searchInBook) {
      return searchResultList;
    }

    const isValidTab = ["sources", "books", "authors", "topics"].includes(this.props.tab);
    const activeTab = isValidTab ? this.props.tab : "sources";
    const closeMobileFilters = () => this.setState({mobileFiltersOpen: false});

    // Sidebar rule: Sources keeps the existing filters, Books gets a searchable
    // category list, Authors/Topics get a sort-only panel on mobile.
    let sidebar = null;
    if (activeTab === "sources" && this.props.totalResults?.getValue() > 0) {
      sidebar = <SearchFilters
          query={this.props.query}
          searchState={this.props.searchState}
          updateAppliedFilter={this.props.updateAppliedFilter.bind(null, this.props.searchState)}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          closeMobileFilters={closeMobileFilters}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (activeTab === "books") {
      const dataLoaded = !!this.state.entityData.book;
      let visibleBookFilters = this.state.bookCategoryFilters;
      if (dataLoaded) {
        const counts = {};
        this.state.entityData.book.hits.forEach(hit => {
          if (!hit.categories) return;
          const topKey = hit.categories[0];
          const subKey = hit.categories.length > 1 ? `${hit.categories[0]}/${hit.categories[1]}` : null;
          counts[topKey] = (counts[topKey] || 0) + 1;
          if (subKey) counts[subKey] = (counts[subKey] || 0) + 1;
        });
        this.state.bookCategoryFilters.forEach(f => {
          f.docCount = counts[f.aggKey];
          f.children.forEach(child => { child.docCount = counts[child.aggKey]; });
        });
        visibleBookFilters = this.state.bookCategoryFilters.filter(f => (f.docCount || 0) > 0);
      }
      sidebar = <BookSearchFilters
          filters={visibleBookFilters}
          updateSelected={this.toggleBookCategoryFilter}
          hideEmpty={dataLoaded}
          mobileSortProps={!useDesktopTabs ? {
            sortOptions: ENTITY_SORT_OPTIONS.books,
            sortType: this.state.entitySort.book,
            onSortChange: (key) => this.setEntitySort('book', key),
            onClose: closeMobileFilters,
          } : null}
      />;
    } else if (!useDesktopTabs) {
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

    const isExactSearch = this.props.searchState.field === this.props.searchState.fieldExact;
    const handleExactMatchChange = (val) => {
      const defaultField = SearchState.metadataByType[this.props.type]?.field;
      this.props.updateAppliedOptionField(val === "exact" ? this.props.searchState.fieldExact : defaultField);
    };

    const tabs = [
      {id: "sources", title: "common.sources", count: this.props.totalResults?.asString() || ""},
      {id: "books",   title: "common.books",   count: this.formatEntityCount(this.state.entityData.book?.total)},
      {id: "authors", title: "common.authors", count: this.formatEntityCount(this.state.entityData.author?.total)},
      {id: "topics",  title: "common.topics",  count: this.formatEntityCount(this.state.entityData.topic?.total)},
    ];

    const tabPanels = [
      <div className="searchTabPanel" key="sources">
        <div className="searchTopMatter">
          {useDesktopTabs && !this.props.compare && this.props.type === "text" && (
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
            {makeSortFilterControls(!(this.props.totalResults?.getValue() > 0))}
          </div>
        </div>
        {this.props.totalResults && !this.props.totalResults.getValue()
          ? <NoSearchResults mode="sources" query={this.props.query} />
          : searchResultList}
      </div>,
      <div className="searchTabPanel" key="books">
        <div className="searchSortBar">
          {useDesktopTabs
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.books}
                sortType={this.state.entitySort.book}
                onSortChange={(key) => this.setEntitySort('book', key)}
                disabled={!this.hasEntityResults('book')}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
                disabled={!this.hasEntityResults('book')}
              />
          }
        </div>
        <EntitySearchResults type="book" data={this.getSortedEntityData('book')} query={this.props.query}
                             loadMore={() => this.loadNextEntityPage('book')}/>
      </div>,
      <div className="searchTabPanel" key="authors">
        <div className="searchSortBar">
          {useDesktopTabs
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.authors}
                sortType={this.state.entitySort.author}
                onSortChange={(key) => this.setEntitySort('author', key)}
                disabled={!this.hasEntityResults('author')}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
                disabled={!this.hasEntityResults('author')}
              />
          }
        </div>
        <EntitySearchResults type="author" data={this.getSortedEntityData('author')} query={this.props.query}
                             loadMore={() => this.loadNextEntityPage('author')}/>
      </div>,
      <div className="searchTabPanel" key="topics">
        <div className="searchSortBar">
          {useDesktopTabs
            ? <SearchSortDropdown
                options={ENTITY_SORT_OPTIONS.topics}
                sortType={this.state.entitySort.topic}
                onSortChange={(key) => this.setEntitySort('topic', key)}
                disabled={!this.hasEntityResults('topic')}
              />
            : <MobileFilterIconButton
                openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
                disabled={!this.hasEntityResults('topic')}
              />
          }
        </div>
        <EntitySearchResults type="topic" data={this.getSortedEntityData('topic')} query={this.props.query}
                             loadMore={() => this.loadNextEntityPage('topic')}/>
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

                {this.props.isQueryRunning && !this.props.hits.length
                  ? <SearchLoadSkeleton />
                  : useDesktopTabs
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
