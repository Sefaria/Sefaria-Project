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
import SearchResultCard from './SearchResultCard';
import {
  CategoryColorLine,
  InterfaceText,
  LoadingMessage,
  TabView,
} from './Misc';
import SearchLoadSkeleton from './SearchLoadSkeleton';


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

    const isValidTab = ["sources", "books", "authors", "topics"].includes(this.props.tab);
    const activeTab = isValidTab ? this.props.tab : "sources";

    // Sidebar rule: Sources keeps the existing filters, Books gets a searchable
    // category list, Topics and Authors get no sidebar.
    let sidebar = null;
    if (activeTab === "sources" && this.props.totalResults?.getValue() > 0) {
      sidebar = <SearchFilters
          query={this.props.query}
          searchState={this.props.searchState}
          updateAppliedFilter={this.props.updateAppliedFilter.bind(null, this.props.searchState)}
          updateAppliedOptionField={this.props.updateAppliedOptionField}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          closeMobileFilters={() => this.setState({mobileFiltersOpen: false})}
          compare={this.props.compare}
          type={this.props.type}/>;
    } else if (activeTab === "books") {
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
                  : <TabView
                        tabs={tabs}
                        currTabName={isValidTab ? this.props.tab : null}
                        setTab={this.setTab}
                        renderTab={this.renderTab}
                        containerClasses={"largeTabs"}>
                      <div className="searchTabPanel" key="sources">
                        <div className="searchTopMatter">
                          <div>
                            {sortFilterControls}
                          </div>
                        </div>
                        {searchResultList}
                      </div>
                      <div className="searchTabPanel" key="books">
                        <EntitySearchResults type="book" data={this.state.entityData.book} query={this.props.query}/>
                      </div>
                      <div className="searchTabPanel" key="authors">
                        <EntitySearchResults type="author" data={this.state.entityData.author} query={this.props.query}/>
                      </div>
                      <div className="searchTabPanel" key="topics">
                        <EntitySearchResults type="topic" data={this.state.entityData.topic} query={this.props.query}/>
                      </div>
                    </TabView>
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
