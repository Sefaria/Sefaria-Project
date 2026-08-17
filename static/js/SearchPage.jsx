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
import {MobileFilterIconButton, SearchSortBox} from './SearchResultList';
import {SearchResultList} from "./SearchResultList";
import SearchSortDropdown, {ENTITY_SORT_OPTIONS} from './SearchSortDropdown';
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
import SearchAnalytics from './sefaria/searchAnalytics';


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
          enterKeyHint="search"
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


// Widths at or below this get the mobile tab strip instead of the desktop TabView.
const DESKTOP_TABS_MIN_WIDTH = 985;

// Elasticsearch's default `max_result_window`: it refuses a from/size paging request past
// this offset, so infinite scroll has to stop here and the count badge caps at "10,000+".
const ES_MAX_RESULT_WINDOW = 10000;

// The three entity tabs. They differ only in which entity type they query, which sort
// options they offer, and their label — everything else (fetching, paging, sorting, the
// sort control, the results list) is identical, so they are driven from this table rather
// than written out three times. `id` is the URL/tab name; `type` is the /api/entity-search
// type and the key under which this tab's data and sort live in component state.
const ENTITY_TABS = [
  {id: "books",   type: "book",   title: "common.books",   sortOptions: "books"},
  {id: "authors", type: "author", title: "common.authors", sortOptions: "authors"},
  {id: "topics",  type: "topic",  title: "common.topics",  sortOptions: "topics"},
];

const ALL_TAB_IDS = ["sources", ...ENTITY_TABS.map(t => t.id)];

const emptyEntityData  = () => Object.fromEntries(ENTITY_TABS.map(t => [t.type, null]));
const defaultEntitySort = () => Object.fromEntries(ENTITY_TABS.map(t => [t.type, 'relevance']));


const formatEntityYear = (year) => {
  if (year === null || year === undefined) { return null; }
  const abs = Math.abs(year);
  return Sefaria._bilingual(year < 0 ? 'search.year.bce' : 'search.year.ce', {year: abs});
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
  // Both response shapes carry the author the same way — the flat book index denormalizes
  // `authors`/`author_names` onto every hit, and the author-works aggregation adds them to
  // individual works (see _author_works_response). Rows with no author resolve to undefined
  // and the card omits the line: category rows, which collapse many books, and the handful of
  // books whose Mongo record simply has no author recorded.
  const authorNames = hit.author_names || [];
  const isHebrew = s => /[֐-׿]/.test(s);
  const common = {
    mode: 'books',
    name: hit.title_en || hit.title_he,
    hebrewName: hit.title_he || hit.title_en,
    secondaryDate: date?.en,
    hebrewSecondaryDate: date?.he,
    description: hit.description_en,
    hebrewDescription: hit.description_he,
    secondaryAuthor: authorNames.find(n => !isHebrew(n)) || authorNames[0],
    hebrewSecondaryAuthor: authorNames.find(isHebrew),
    secondaryAuthorHref: hit.authors?.[0] ? `/topics/${hit.authors[0]}?tab=author-works-on-sefaria` : undefined,
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
  };
};


const ENTITY_CARD_PROP_BUILDERS = {
  topic: topicHitCardProps,
  author: authorHitCardProps,
  book: bookHitCardProps,
};


const EntitySearchResults = ({type, data, query, loadMore, trackClicks}) => {
  if (!data) {
    const searching = Sefaria._bilingual("search.searching");
    return <LoadingMessage message={searching.en} heMessage={searching.he} />;
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
      {data.hits.map((hit, i) => {
        const cardProps = ENTITY_CARD_PROP_BUILDERS[type](hit, query);
        // analyticsPosition (1-based rank) opts the card into firing the
        // search_element_clicked / search_flow_ended GA4 events on click.
        return <SearchResultCard key={cardProps.href} {...cardProps}
                                 analyticsPosition={trackClicks ? i + 1 : undefined} />;
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
      entityData: emptyEntityData(),  // accumulated pages per type; null while a fetch is in flight
      entitySort: defaultEntitySort(),
      bookCategoryFilters: this.makeBookCategoryFilters(),
      // {"Tanakh": 11, "Tanakh/Torah": 5, ...} from the API — how many books match the query
      // in each category, over the whole match set. Kept outside `entityData` on purpose: it
      // survives the refetch that a sort or filter change triggers, so the sidebar keeps its
      // numbers instead of blanking out and back on every click.
      bookCategoryCounts: null,
      // `window` does not exist in the Node server bundle (USE_NODE), so the viewport
      // cannot be measured here. Default to desktop: this is ANDed with
      // `Sefaria.multiPanel` (decided server-side from the User-Agent) at render time,
      // so a mobile UA never gets desktop tabs regardless. componentDidMount re-measures
      // and corrects the narrow-desktop-window case on the client.
      useDesktopTabs: true,
    };
    this._onResize = () => {
      const next = window.innerWidth > DESKTOP_TABS_MIN_WIDTH;
      if (next !== this.state.useDesktopTabs) this.setState({useDesktopTabs: next});
    };
    // One counter per type, bumped every time that type's accumulated pages are thrown away
    // (new query, new sort, new category filter). A response is only applied if its counter
    // still matches: without this, a page that was already in flight when the sort changed
    // would land afterwards and mix rows from the old ordering into the new list. Kept off
    // `state` because it must update synchronously, before React re-renders.
    this._entityFetchTokens = Object.fromEntries(ENTITY_TABS.map(t => [t.type, 0]));
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
    if (this.state.entitySort[type] === sortKey) { return; }
    // The server sorts the entire match set, so every page already downloaded is in the old
    // order and can't be reused — discard them and start again from the first page.
    this.setState(prev => ({entitySort: {...prev.entitySort, [type]: sortKey}}),
                  () => this.resetEntityResults([type]));
  }

  // The category paths currently checked in the Books sidebar, in the form the API expects
  // ("Tanakh", "Tanakh/Torah"). getAppliedFilters() already collapses a fully-selected
  // parent to its own key and only descends into partially-selected ones. Categories apply
  // to books alone — the API rejects a filter on any other type.
  selectedCategoryPaths(type) {
    if (type !== 'book') { return []; }
    return this.state.bookCategoryFilters.flatMap(f => f.getAppliedFilters());
  }

  // Disabled only when we *know* there is nothing to sort — a loaded but empty result set.
  // While a fetch is in flight (entityData null: first load, or a refetch after a sort or
  // filter change) the control stays live, so a second change doesn't have to wait out the
  // first round trip.
  isEntitySortDisabled(type) {
    const data = this.state.entityData[type];
    return !!data && !data.hits.length;
  }

  toggleBookCategoryFilter(filter) {
    if (!this.props.compare) {
      SearchAnalytics.elementClicked({elementType: 'filter', elementValue: filter.title, count: filter.docCount});
    }
    filter.isSelected() ? filter.setUnselected(true) : filter.setSelected(true);
    // Same as a sort change: the server applies the filter to the whole match set, so the
    // downloaded pages (a filtered slice of the first ~20 rows) have to go.
    this.setState({bookCategoryFilters: [...this.state.bookCategoryFilters]},
                  () => this.resetEntityResults(['book']));
  }

  // Throw away the accumulated pages for each of `types` and refetch page 1 under the
  // current sort and filters.
  resetEntityResults(types) {
    types.forEach(type => { this._entityFetchTokens[type] += 1; });  // abandon in-flight pages
    this.setState(
      prev => ({entityData: {...prev.entityData, ...Object.fromEntries(types.map(t => [t, null]))}}),
      () => this.fetchEntityResults(types),  // runs after state settles, so it reads the new sort/filters
    );
  }

  // Wraps the sources-tab filter callback so the click is also reported to
  // search analytics before the filter is applied.
  handleSourcesFilterClick(filter) {
    if (!this.props.compare) {
      SearchAnalytics.elementClicked({elementType: 'filter', elementValue: filter.title, count: filter.docCount});
    }
    this.props.updateAppliedFilter(this.props.searchState, filter);
  }

  componentDidMount() {
    this.fetchEntityResults();
    this._onResize();  // first real viewport measurement; the constructor could not take one
    window.addEventListener('resize', this._onResize);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._onResize);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.query !== this.props.query) {
      // A new query invalidates the category selections and their counts — both describe the
      // previous result set — so rebuild the filter tree unselected before refetching.
      this.setState({bookCategoryFilters: this.makeBookCategoryFilters(), bookCategoryCounts: null},
                    () => this.resetEntityResults(ENTITY_TABS.map(t => t.type)));
    }
  }

  fetchEntityResults(types = ENTITY_TABS.map(t => t.type)) {
    const query = this.props.query;
    if (!query || this.props.searchInBook) { return; }
    types.forEach(type => {
      const token = ++this._entityFetchTokens[type];
      // Analytics: each entity search is one of the four APIs whose return
      // completes a query (search_query_executed fires once all report in).
      // The API key is the plural tab name ('topics'/'authors'/'books'). A sort
      // or filter change refetches, but recordApiResult ignores a repeat report
      // for an API it already heard from, so the event still fires exactly once.
      Sefaria.search.entitySearch(query, type, 0, {
            sort: this.state.entitySort[type],
            categoryPaths: this.selectedCategoryPaths(type),
          })
          .then(data => {
            if (this._entityFetchTokens[type] !== token) { return; }  // a newer fetch superseded this one
            if (!this.props.compare) { SearchAnalytics.recordApiResult(type + 's', data.total); }
            this.setState(prev => this.withCategoryCounts({...prev.entityData, [type]: this.makeEntityEntry(data)}, data));
          })
          .catch((err) => {  // count badge stays at "0", panel stays on the loading message
            if (this.props.query !== query || this.props.compare) { return; }
            SearchAnalytics.recordApiResult(type + 's', null, err?.message || String(err));
          });
    });
  }

  // Normalize an API page into the paging entry the tab panels read. `total` is the full
  // match count (so the badge and "more to load" stay correct), `moreToLoad` compares it to
  // how many hits we've accumulated so far.
  makeEntityEntry(data, prevHits = []) {
    const hits = prevHits.concat(data.hits);
    // Cap at ES's default max_result_window so infinite scroll stops before sending an offset
    // that ES would reject. `total` is kept intact for the count badge.
    const loadableTotal = Math.min(data.total, ES_MAX_RESULT_WINDOW);
    return {hits, total: data.total, moreToLoad: hits.length < loadableTotal, isLoadingMore: false};
  }

  // Book responses carry `categoryCounts` for the sidebar; every other response leaves the
  // counts we already hold alone. They are identical on every page of a search — the API
  // counts the whole match set regardless of paging or filtering — so taking the latest is
  // safe, and there is nothing to merge.
  withCategoryCounts(entityData, data) {
    return data.categoryCounts ? {entityData, bookCategoryCounts: data.categoryCounts} : {entityData};
  }

  loadNextEntityPage(type) {
    const query = this.props.query;
    const cur = this.state.entityData[type];
    if (!cur || cur.isLoadingMore || !cur.moreToLoad) { return; }
    // Not bumped, only captured: this extends the current result set rather than replacing
    // it, so the page is dropped if a sort/filter/query change intervenes.
    const token = this._entityFetchTokens[type];
    this.setState(prev => ({
      entityData: {...prev.entityData, [type]: {...prev.entityData[type], isLoadingMore: true}},
    }));
    Sefaria.search.entitySearch(query, type, cur.hits.length, {
          sort: this.state.entitySort[type],
          categoryPaths: this.selectedCategoryPaths(type),
        })
        .then(data => {
          if (this._entityFetchTokens[type] !== token) { return; }  // superseded — these rows are stale
          this.setState(prev => {
            const prevEntry = prev.entityData[type];
            if (!prevEntry) { return null; }  // results were reset while this page was in flight
            return this.withCategoryCounts(
                {...prev.entityData, [type]: this.makeEntityEntry(data, prevEntry.hits)}, data);
          });
        })
        .catch(() => {
          if (this._entityFetchTokens[type] !== token) { return; }
          this.setState(prev => {
            const prevEntry = prev.entityData[type];
            if (!prevEntry) { return null; }
            return {entityData: {...prev.entityData, [type]: {...prevEntry, isLoadingMore: false}}};
          });
        });
  }

  formatEntityCount(count) {
    if (count === null || count === undefined) { return ""; }
    return count >= ES_MAX_RESULT_WINDOW
        ? `${ES_MAX_RESULT_WINDOW.addCommas()}+`
        : count.addCommas();
  }

  setTab(tab, replaceHistory) {
    // The active tab lives in panel state (this.props.tab) so it is serialized
    // into the URL and history; back/forward restores it via handlePopState.
    // replaceHistory is only passed (as true) by TabView's programmatic
    // default-tab call on mount (Misc.jsx TabView.componentDidMount) -- that's
    // not a user click, so don't report it. User clicks omit the argument.
    if (!this.props.compare && !replaceHistory) {
      // Raw (unformatted) count shown on the clicked tab; sources' count lives
      // in props, the entity tabs' counts in state.
      const tabCounts = {
        sources: this.props.totalResults?.getValue(),
        books:   this.state.entityData.book?.total,
        authors: this.state.entityData.author?.total,
        topics:  this.state.entityData.topic?.total,
      };
      const tabLabels = {sources: 'Sources', books: 'Books', authors: 'Authors', topics: 'Topics'};
      SearchAnalytics.elementClicked({elementType: 'tab', elementValue: tabLabels[tab] || tab, count: tabCounts[tab]});
    }
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
      Sefaria.multiPanel && !this.props.compare
        ? <SearchSortBox
              type={this.props.type}
              sortTypeArray={this.props.sortTypeArray}
              updateAppliedOptionSort={this.props.updateAppliedOptionSort}
              sortType={this.props.searchState.sortType}
              disabled={disabled} />
        : <MobileFilterIconButton
              openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
              disabled={disabled} />;

    if (this.props.searchInBook) {
      return searchResultList;
    }

    const isValidTab = ALL_TAB_IDS.includes(this.props.tab);
    const activeTab = isValidTab ? this.props.tab : "sources";
    const closeMobileFilters = () => this.setState({mobileFiltersOpen: false});

    const isExactSearch = this.props.searchState.field === this.props.searchState.fieldExact;
    const handleExactMatchChange = (val) => {
      const defaultField = SearchState.metadataByType[this.props.type]?.field;
      this.props.updateAppliedOptionField(val === "exact" ? this.props.searchState.fieldExact : defaultField);
    };
    // On mobile the exact/all toggle lives inside the filter panel (passed as topSection);
    // on desktop it renders separately above the results (see searchTopMatter below).
    const searchTypeSection = this.props.type === "text" ? (
      <div className="searchFilterGroup">
        <h2><InterfaceText>search_page.search_type</InterfaceText></h2>
        <SearchToggle
          options={[
            {name: "all",   ...Sefaria._bilingual("search.exact_match_toggle.all_results")},
            {name: "exact", ...Sefaria._bilingual("search.exact_match_toggle.exact_match")},
          ]}
          selected={isExactSearch ? "exact" : "all"}
          onChange={handleExactMatchChange}
        />
      </div>
    ) : null;

    // Sidebar rule: Sources keeps the existing filters, Books gets a searchable
    // category list, Authors/Topics get a sort-only panel on mobile.
    let sidebar = null;
    if (activeTab === "sources" && this.props.totalResults?.getValue() > 0) {
      sidebar = <SearchFilters
          query={this.props.query}
          searchState={this.props.searchState}
          updateAppliedFilter={this.handleSourcesFilterClick}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          topSection={searchTypeSection}
          closeMobileFilters={closeMobileFilters}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (activeTab === "books") {
      // The numbers next to each category come from the API (`categoryCounts`), which counts
      // the whole match set — not from the rows on screen. Counting those would mean "how
      // many of the ~20 books I downloaded", a number that climbs as you scroll and, once
      // the server does the filtering, drops to zero for every category except the selected
      // one — hiding them all and stranding the reader in a one-row sidebar.
      const counts = this.state.bookCategoryCounts;
      let visibleBookFilters = this.state.bookCategoryFilters;
      if (counts) {
        this.state.bookCategoryFilters.forEach(f => {
          f.docCount = counts[f.aggKey] || 0;
          f.children.forEach(child => { child.docCount = counts[child.aggKey] || 0; });
        });
        visibleBookFilters = this.state.bookCategoryFilters.filter(f => f.docCount > 0);
      }
      sidebar = <BookSearchFilters
          filters={visibleBookFilters}
          updateSelected={this.toggleBookCategoryFilter}
          hideEmpty={!!counts}
          mobileSortProps={!Sefaria.multiPanel ? {
            sortOptions: ENTITY_SORT_OPTIONS.books,
            sortType: this.state.entitySort.book,
            onSortChange: (key) => this.setEntitySort('book', key),
            onClose: closeMobileFilters,
          } : null}
      />;
    } else if (!Sefaria.multiPanel) {
      // Whatever entity tab is left (Authors or Topics — Books was handled above, since it
      // also gets the category filter list) gets an identical sort-only panel. Sources
      // reaches here only when it has no results, and gets no sidebar.
      const entityTab = ENTITY_TABS.find(t => t.id === activeTab);
      if (entityTab) {
        sidebar = <EntitySortPanel
            sortOptions={ENTITY_SORT_OPTIONS[entityTab.sortOptions]}
            sortType={this.state.entitySort[entityTab.type]}
            onSortChange={(key) => this.setEntitySort(entityTab.type, key)}
            onClose={closeMobileFilters}
        />;
      }
    }

    const tabs = [
      {id: "sources", title: "common.sources", count: this.props.totalResults?.asString() || ""},
      ...ENTITY_TABS.map(({id, type, title}) => ({
        id,
        title,
        count: this.formatEntityCount(this.state.entityData[type]?.total),
      })),
    ];

    const tabPanels = [
      <div className="searchTabPanel" key="sources">
        <div className="searchTopMatter">
          {Sefaria.multiPanel && !this.props.compare && this.props.type === "text" && (
            <SearchToggle
              options={[
                {name: "all",   ...Sefaria._bilingual("search.exact_match_toggle.all_results")},
                {name: "exact", ...Sefaria._bilingual("search.exact_match_toggle.exact_match")},
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
      ...ENTITY_TABS.map(({id, type, sortOptions}) => (
        <div className="searchTabPanel" key={id}>
          <div className="searchSortBar">
            {Sefaria.multiPanel
              ? <SearchSortDropdown
                  options={ENTITY_SORT_OPTIONS[sortOptions]}
                  sortType={this.state.entitySort[type]}
                  onSortChange={(key) => this.setEntitySort(type, key)}
                  disabled={this.isEntitySortDisabled(type)}
                />
              : <MobileFilterIconButton
                  openMobileFilters={() => this.setState({mobileFiltersOpen: true})}
                  disabled={this.isEntitySortDisabled(type)}
                />
            }
          </div>
          <EntitySearchResults type={type} data={this.state.entityData[type]} query={this.props.query}
                               trackClicks={!this.props.compare}
                               loadMore={() => this.loadNextEntityPage(type)}/>
        </div>
      )),
    ];

    return (
        <div className={classes}>
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
                          key={this.props.query}
                          tabs={tabs}
                          currTabName={isValidTab ? this.props.tab : null}
                          setTab={this.setTab}
                          renderTab={this.renderTab}
                          containerClasses={"largeTabs"}>
                        {tabPanels}
                      </TabView>
                    : <React.Fragment key={this.props.query}>
                        <SearchTabsMobileWeb
                            tabs={tabs}
                            currTabName={activeTab}
                            setTab={this.setTab}/>
                        {tabPanels[tabs.findIndex(t => t.id === activeTab)]}
                      </React.Fragment>
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
