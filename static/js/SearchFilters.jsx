import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import Util from './sefaria/util';
import $ from './sefaria/sefariaJquery';
import SearchState from './sefaria/searchState';
import classNames  from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import {
  InterfaceText,
  LoadingMessage,
  CloseButton,
  ToggleSet,
} from './Misc';

const SortRadioList = ({options, value, onChange}) => (
  <ul className="sortRadioList">
    {options.map(opt => (
      <li key={opt.type} className="sortRadioItem">
        <label>
          <input
            type="radio"
            name="sortType"
            value={opt.type}
            checked={value === opt.type}
            onChange={() => onChange(opt.type)}
          />
          <span className="sortRadioLabel">
            {opt.heName
              ? <InterfaceText text={{en: opt.name, he: opt.heName}} />
              : <InterfaceText>{opt.name}</InterfaceText>
            }
          </span>
        </label>
      </li>
    ))}
  </ul>
);


class SearchFilters extends Component {
  getSelectedTitles(lang) {
    let results = [];
    for (let i = 0; i < this.props.searchState.availableFilters.length; i++) {
      const tempSelected = this.props.searchState.availableFilters[i].getSelectedTitles(lang);
      results = results.concat(tempSelected);
    }
    return results;
  }
  render() {
    const filters = (this.props.type === 'text' ?
      <TextSearchFilters
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
      /> :
      <SheetSearchFilters
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
      />
    );

    const {searchState, type, updateAppliedOptionSort} = this.props;

    return Sefaria.multiPanel && !this.props.compare ? (
      <div className="searchFilters navSidebarModule">
        {filters}
      </div>
    ) : (
      <>
        <div className="mobileSearchFiltersHeader sans-serif">
          <CloseButton onClick={this.props.closeMobileFilters} />
          <InterfaceText>Filters</InterfaceText>
          <div></div>
        </div>
        <div className="searchFilters navSidebarModule">
          {this.props.topSection}
          <div className="searchFilterGroup">
            <h2>
              <InterfaceText>Sort by</InterfaceText>
            </h2>
            <SortRadioList
              options={SearchState.metadataByType[type].sortTypeArray}
              value={searchState.sortType}
              onChange={updateAppliedOptionSort}
            />
          </div>

          {filters}
        </div>
        <div className="mobileSearchFiltersFooter">
          <div className="button fillWidth" onClick={this.props.closeMobileFilters}>
            <InterfaceText>Show Results</InterfaceText>
          </div>
        </div>
      </>
    );
  }
}
SearchFilters.propTypes = {
  query:                   PropTypes.string,
  searchState:             PropTypes.object,
  total:                   PropTypes.number,
  updateAppliedFilter:     PropTypes.func,
  updateAppliedOptionSort: PropTypes.func,
  topSection:              PropTypes.node,
  isQueryRunning:          PropTypes.bool,
  type:                    PropTypes.string,
};


class TextSearchFilters extends Component {
  render() {
    return (
      <div className="searchFilterBoxes">
        <SearchFilterGroup
          name="Texts"
          searchable={true}
          filters={this.props.availableFilters}
          updateSelected={this.props.updateAppliedFilter}
          expandable={true} />
      </div>
    );
  }
}
TextSearchFilters.propTypes = {
  availableFilters:    PropTypes.array,
  updateAppliedFilter: PropTypes.func,
};


const SearchFilterGroup = ({name, filters, updateSelected, expandable, paged, searchable, preserveOrder, searchPlaceholder}) => {
  if (!filters || !filters.length) { return null; }

  useEffect(() => {
    const filterValue = document.getElementById(`filter${name}`)?.value ? document.getElementById(`filter${name}`)?.value : "";
    updateFilters(filterValue);
  }, [filters])

  const [displayedFilters, setFilters] = useState(filters);
  const [showClearInputButton, setShowClearInputButton] = useState(false)

  let content = displayedFilters.map(filter => (
    <SearchFilter
      filter={filter}
      updateSelected={updateSelected}
      expandable={expandable}
      filterSearchValue={document.getElementById(`filter${name}`)?.value}
      key={filter.aggKey}/>
  ));

  if (name === 'Collections') {content.sort((a,b) => {
    const title = Sefaria.interfaceLang==='english' ? 'title' : 'heTitle';
    return !a.props.filter[title] - !b.props.filter[title]; //first the collections with title in the interface's language
  })}

  if (paged) {
    content = <PagedList items={content} />
  }

  const hasWordStartingWithOrSelected = (item, filterValue) => {
    let escapedFilterValue = filterValue.replace("-", "\-");
    escapedFilterValue = escapedFilterValue.replace(/[^\w\s\-]/g, "");
    if (item.selected || item.title.match(new RegExp(`(?:^|.+\\s)${escapedFilterValue}.*`, "i")) || item.heTitle.match(new RegExp(`(?:^|.+\\s)${escapedFilterValue}.*`, "i"))) {
      return true;
    } else if (item.children.filter(x => hasWordStartingWithOrSelected(x, escapedFilterValue)).length > 0) {
      return true;
    }
    else {
      return false;
    }
  }
  
  const sortFiltersBySelected = (filter1, filter2) => {
   return filter2.selected - filter1.selected;
  }

  const updateFilters = text => {
    if (text && text !== "") {
      const matched = filters.filter(x => hasWordStartingWithOrSelected(x, text));
      setFilters(!expandable && !preserveOrder ? matched.sort(sortFiltersBySelected) : matched);
      setShowClearInputButton(true);
    } else {
      setFilters(!expandable && !preserveOrder ? filters.sort(sortFiltersBySelected) : filters);
      setShowClearInputButton(false);
    }
  }
  const clearInput = () => {
    document.getElementById(`filter${name}`).value = "";
    updateFilters("");
  }
  // need hebrew for placeholder/title
  const clearInputButton = <button aria-label={Sefaria._("Clear input")} onClick={clearInput}><img src="/static/icons/heavy-x.svg" className="searchFilterIcon" aria-hidden="true" tabIndex="0"></img></button>;
  const search = searchable ? <div className="searchBox"><input id={`filter${name}`} className="searchFiltersInput" placeholder={searchPlaceholder || Sefaria._(`Search ${name}`)} title={`Type to Filter ${name} Shown`} onChange={e => updateFilters(e.target.value)}></input>{showClearInputButton ? clearInputButton : null}</div>  : null;

  return (
    <div className="searchFilterGroup">
      <h2>
        <InterfaceText context="SearchFilters">{name}</InterfaceText>
      </h2>
      {search}
      <ul className="searchFilterList">{content}</ul>
    </div>
  );
};



class SearchFilter extends Component {
  constructor(props) {
    super(props);
    this.state = {
      expanded: false,
      selected: props.filter.selected
    };
  }
  componentWillReceiveProps(newProps) {
    if (newProps.filter.selected != this.state.selected) {
      this.setState({selected: newProps.filter.selected});
    }
  }
  componentDidMount() {
    // Can't set indeterminate in the render phase.  https://github.com/facebook/react/issues/1798
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
    if (this.props.filter.isPartial()) {
      ReactDOM.findDOMNode(this).querySelector("label").setAttribute("aria-checked", "mixed");
    }
    else {
      ReactDOM.findDOMNode(this).querySelector("label").setAttribute("aria-checked", this.state.selected==1);
    }
  }
  componentDidUpdate() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
    if (this.props.filter.isPartial()) {
      ReactDOM.findDOMNode(this).querySelector("label").setAttribute("aria-checked", "mixed");
    }
    else {
      ReactDOM.findDOMNode(this).querySelector("label").setAttribute("aria-checked", this.state.selected==1);
    }
  }
  handleFilterClick(evt) {
    this.props.updateSelected(this.props.filter)
  }
  toggleExpanded() {
    this.props.expandable && this.setState({expanded: !this.state.expanded});    
  }
  autoExpand(filter) {
    return this.props.filterSearchValue !== undefined && this.props.filterSearchValue !== null && this.props.filterSearchValue !== "" && this.props.expandable && filter.getLeafNodes(this.props.filterSearchValue).length > 0;
  }
  render() {
    const { filter, expandable } = this.props;
    const toggleMessage = "Press enter to toggle search filter for " + filter.title + ".";
    const expandMessage = "Press enter to toggle the list of specific books within " + filter.title + " to filter by."

    return (
      <>
        <li>
          <div className="checkboxAndText">
            <input type="checkbox" id={filter.aggKey} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
            <label 
              onClick={this.handleFilterClick} 
              id={"label-for-"+this.props.filter.aggKey} 
              tabIndex="0"
              onKeyDown={Util.handleEnterKey(this.handleFilterClick)} 
              aria-label={toggleMessage}>
              <span></span>
            </label>
            <span
              className="searchFilterTitle"
              onClick={expandable ? this.toggleExpanded : this.handleFilterClick}
              onKeyDown={expandable ? Util.handleEnterKey(this.toggleExpanded) : Util.handleEnterKey(this.handleFilterClick)}
              tabIndex={expandable ? "0" : null}
              aria-label={expandable ? expandMessage : toggleMessage} >
              <InterfaceText text={{en: filter.title, he: filter.heTitle}} />&nbsp;
              {filter.docCount !== undefined ?
                <span className="filter-count"><InterfaceText>{`(${filter.docCount})`}</InterfaceText></span> : null}
            </span>
          </div>
          {this.props.expandable ? <i className="fa fa-angle-down" onClick={this.toggleExpanded} /> : null}
        </li>
        {this.state.expanded || this.autoExpand(filter) ? 
        <li>
          <div className="searchFilterBooks">
            {filter.getLeafNodes(this.props.filterSearchValue).map(subFilter => (
              <SearchFilter
                filter={subFilter}
                updateSelected={this.props.updateSelected}
                key={subFilter.aggKey} />
            ))}
          </div>
        </li> : null}
      </>
    );
  }
}
SearchFilter.propTypes = {
  filter:         PropTypes.object.isRequired,
  expandable:     PropTypes.bool,
  updateSelected: PropTypes.func.isRequired,
};


const BookSearchFilters = ({filters, updateSelected, mobileSortProps}) => {
  const filterContent = (
    <div className="searchFilterBoxes">
      <SearchFilterGroup
        name="Texts"
        searchable={true}
        filters={filters}
        updateSelected={updateSelected}
        preserveOrder={true}
        searchPlaceholder={Sefaria._("Search")} />
    </div>
  );

  if (!mobileSortProps) {
    return (
      <div className="searchFilters navSidebarModule">
        {filterContent}
      </div>
    );
  }

  const {sortOptions, sortType, onSortChange, onClose} = mobileSortProps;
  return (
    <>
      <div className="mobileSearchFiltersHeader sans-serif">
        <CloseButton onClick={onClose} />
        <InterfaceText>Filter</InterfaceText>
        <div></div>
      </div>
      <div className="searchFilters navSidebarModule">
        <div className="searchFilterGroup">
          <h2><InterfaceText>Sort by</InterfaceText></h2>
          <SortRadioList options={sortOptions} value={sortType} onChange={onSortChange} />
        </div>
        {filterContent}
      </div>
      <div className="mobileSearchFiltersFooter">
        <div className="button fillWidth" onClick={onClose}>
          <InterfaceText>Show Results</InterfaceText>
        </div>
      </div>
    </>
  );
};
BookSearchFilters.propTypes = {
  filters:        PropTypes.array.isRequired,
  updateSelected: PropTypes.func.isRequired,
  mobileSortProps: PropTypes.object,
};


class SheetSearchFilters extends Component {
  render() {
    const collectionFilters = this.props.availableFilters.filter(filter => filter.aggType === 'collections' && (filter.title || filter.heTitle));
    const tagFilters = this.props.availableFilters.filter(filter => filter.aggType.match(/^topics/) && (filter.title || filter.heTitle));

    return (
      <div className="searchFilterBoxes" role="dialog">
        <SearchFilterGroup
          name="Topics"
          filters={tagFilters}
          updateSelected={this.props.updateAppliedFilter}
          paged={true} 
          searchable={true}
          />

        <SearchFilterGroup
          name="Collections"
          filters={collectionFilters}
          updateSelected={this.props.updateAppliedFilter}
          paged={true} />
      </div>
    );
  }
}
SheetSearchFilters.propTypes = {
  updateAppliedFilter: PropTypes.func.isRequired,
  availableFilters:    PropTypes.array.isRequired,
};


const PagedList = ({items, initial=8, pageSize=20}) => {
  const [cutoff, setCutoff] = useState(initial);
  return (
    <>
      {items.slice(0, cutoff)}
      {items.length > cutoff ?
      <button className="showMore sans-serif" onClick={() => {setCutoff(cutoff + pageSize);}} aria-label={Sefaria._("See More", "SearchFilters")}>
        <InterfaceText context="SearchFilters">See More</InterfaceText>
      </button>
      : null}
    </>
  );
};


const EntitySortPanel = ({sortOptions, sortType, onSortChange, onClose}) => (
  <>
    <div className="mobileSearchFiltersHeader sans-serif">
      <CloseButton onClick={onClose} />
      <InterfaceText>Sort</InterfaceText>
      <div></div>
    </div>
    <div className="searchFilters navSidebarModule">
      <div className="searchFilterGroup">
        <h2><InterfaceText>Sort by</InterfaceText></h2>
        <SortRadioList options={sortOptions} value={sortType} onChange={onSortChange} />
      </div>
    </div>
    <div className="mobileSearchFiltersFooter">
      <div className="button fillWidth" onClick={onClose}>
        <InterfaceText>Show Results</InterfaceText>
      </div>
    </div>
  </>
);
EntitySortPanel.propTypes = {
  sortOptions:  PropTypes.array.isRequired,
  sortType:     PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
  onClose:      PropTypes.func.isRequired,
};


export default SearchFilters;
export { BookSearchFilters, EntitySortPanel };