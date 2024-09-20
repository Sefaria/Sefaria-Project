import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import SearchState from './sefaria/searchState';
import PropTypes from 'prop-types';
import Component from 'react-class';
import {
  InterfaceText,
  CloseButton,
  ToggleSet,
} from './Misc';

class SearchFilters extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isExactSearch: props.searchState.field === props.searchState.fieldExact
    }
  }
  componentWillReceiveProps(newProps) {
    // Save current filters
    // todo: check for cases when we want to rebuild / not
    const { field, fieldExact } = this.props.searchState;
    if ((newProps.query !== this.props.query)
        || (newProps.searchState.availableFilters.length !== this.props.searchState.availableFilters.length)) {

      this.setState({
        isExactSearch: field === fieldExact
      });
    }
  }
  getSelectedTitles(lang) {
    let results = [];
    for (let i = 0; i < this.props.searchState.availableFilters.length; i++) {
      const tempSelected = this.props.searchState.availableFilters[i].getSelectedTitles(lang);
      results = results.concat(tempSelected);
    }
    return results;
  }
  toggleExactSearch() {
    let newExactSearch = !this.state.isExactSearch;
    if (newExactSearch) {
      this.props.updateAppliedOptionField(this.props.searchState.fieldExact);
    } else {
      this.props.updateAppliedOptionField(this.props.searchState.fieldBroad);
    }
    this.setState({isExactSearch: newExactSearch});
  }
  render() {
    const filters = (this.props.type === 'text' ?
      <TextSearchFilters
        toggleExactSearch={this.toggleExactSearch}
        openedCategory={this.state.openedCategory}
        openedCategoryBooks={this.state.openedCategoryBooks}
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
        isExactSearch={this.props.searchState.fieldExact === this.props.searchState.field}
      /> :
      <SheetSearchFilters
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
      />
    );

    const {searchState, type, updateAppliedOptionSort} = this.props;
    const sortOptions = SearchState.metadataByType[type].sortTypeArray.map(data => ({
      name: data.type,
      content: <InterfaceText>{data.name}</InterfaceText>,
      role: "radio",
      ariaLabel: Sefaria._("profile.tab.dropdown.sort_by") + " " + Sefaria._(data.name),
    }));

    return Sefaria.multiPanel && !this.props.compare ? (
      <div className="searchFilters navSidebarModule">
        {filters}
      </div>
    ) : (
      <>
        <div className="mobileSearchFiltersHeader sans-serif">
          <CloseButton onClick={this.props.closeMobileFilters} />
          <InterfaceText>filter</InterfaceText>
          <div></div>
        </div>
        <div className="searchFilters navSidebarModule">
          <div className="searchFilterGroup">
            <h2>
              <InterfaceText>profile.tab.dropdown.sort_by</InterfaceText>
            </h2>
            <ToggleSet
              ariaLabel="Sort by"
              name="sortBy"
              options={sortOptions}
              setOption={(set, sortType) => updateAppliedOptionSort(sortType)}
              currentValue={searchState.sortType}
              blueStyle={true} />
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
  query:                    PropTypes.string,
  searchState:              PropTypes.object,
  total:                    PropTypes.number,
  updateAppliedFilter:      PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort:  PropTypes.func,
  isQueryRunning:           PropTypes.bool,
  type:                     PropTypes.string,
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

        <div className="searchFilterGroup">
          <h2>
            <InterfaceText>common.options</InterfaceText>
          </h2>
          <SearchFilterExactBox
            selected={this.props.isExactSearch}
            checkBoxClick={this.props.toggleExactSearch} />
        </div>
      </div>
    );
  }
}
TextSearchFilters.propTypes = {
  availableFilters:    PropTypes.array,
  openedCategory:      PropTypes.object,
  updateAppliedFilter: PropTypes.func,
  openedCategoryBooks: PropTypes.array,
  isExactSearch:       PropTypes.bool,
  toggleExactSearch:   PropTypes.func,
};


const SearchFilterGroup = ({name, filters, updateSelected, expandable, paged, searchable}) => {
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

  const wordSelected = (item) => {
    if (item.selected) {
      return -1;
    } else {
      return 1;
    }
  }

  const updateFilters = text => {
    if (text && text !== "") {
      if (!expandable) {
        setFilters(filters.filter(x => hasWordStartingWithOrSelected(x, text)).sort(x => wordSelected(x)));
      } else { // don't sort
        setFilters(filters.filter(x => hasWordStartingWithOrSelected(x, text)));
      }
      setShowClearInputButton(true);
    } else {
      if (!expandable) {
        setFilters(filters.sort(x => wordSelected(x)));
      } else {
        setFilters(filters);
      }
      setShowClearInputButton(false);
    }
  }
  const clearInput = () => {
    document.getElementById(`filter${name}`).value = "";
    updateFilters("");
  }
  // need hebrew for placeholder/title
  const clearInputButton = <button aria-label="Clear input" onClick={clearInput}><img src="/static/icons/heavy-x.svg" className="searchFilterIcon" aria-hidden="true" tabIndex="0"></img></button>;
  const search = searchable ? <div className="searchBox"><input id={`filter${name}`} className="searchFiltersInput" placeholder={Sefaria._(`Search ${name}`)} title={`Type to Filter ${name} Shown`} onChange={e => updateFilters(e.target.value)}></input>{showClearInputButton ? clearInputButton : null}</div>  : null;

  return (
    <div className="searchFilterGroup">
      <h2>
        <InterfaceText >{name}</InterfaceText>
      </h2>
      {search}
      {content}
    </div>
  );
};


class SearchFilterExactBox extends Component {
  handleClick() {
    this.props.checkBoxClick();
  }
  handleKeyPress(e) {
    if (e.charCode === 13) { // enter
      this.handleClick(e);
    }
  }
  render() {
    return (
      <li>
        <div className="checkboxAndText">
          <input type="checkbox" id="searchFilterExactBox" className="filter" checked={this.props.selected} onChange={this.handleClick}/>
          <label tabIndex="0" onClick={this.handleClick} onKeyDown={this.handleKeyDown} onKeyPress={this.handleKeyPress}><span></span></label>
        
         <span className={"filter-title"}>
            <InterfaceText>{_("search_filter.exact_matches_only")}</InterfaceText>
          </span>
        </div>
      </li>
    );
  }
}
SearchFilterExactBox.propTypes = {
  selected:      PropTypes.bool,
  checkBoxClick: PropTypes.func
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
    if (newProps.filter.selected !== this.state.selected) {
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
  handleKeyPress(e) {
    if (e.charCode === 13) { // enter
      this.handleFilterClick(e);
    }
  }
  handleExpandKeyPress(e) {
    if (e.charCode === 13) { // enter
      this.toggleExpanded();
    }
  }
  autoExpand(filter) {
    return this.props.filterSearchValue !== undefined && this.props.filterSearchValue !== null && this.props.filterSearchValue !== "" && this.props.expandable && filter.getLeafNodes(this.props.filterSearchValue).length > 0;
  }
  render() {
    const { filter, expandable } = this.props;
    const toggleMessage = Sefaria._("search.message.toggle_filter") + filter.title + ".";
    const expandMessage = filter.title + Sefaria._("search.message.toggle_list_of_books");

    return (
      <>
        <li>
          <div className="checkboxAndText">
            <input type="checkbox" id={filter.aggKey} className="filter" checked={this.state.selected === 1} onChange={this.handleFilterClick}/>
            <label 
              onClick={this.handleFilterClick} 
              id={"label-for-"+this.props.filter.aggKey} 
              tabIndex="0"
              onKeyDown={this.handleKeyDown} 
              onKeyPress={this.handleKeyPress} 
              aria-label={toggleMessage}>
              <span></span>
            </label>
            <span
              className="searchFilterTitle"
              onClick={expandable ? this.toggleExpanded : this.handleFilterClick}
              onKeyPress={expandable ? this.handleExpandKeyPress : this.handleKeyPress}
              tabIndex={expandable ? "0" : null}
              aria-label={expandable ? expandMessage : toggleMessage} >
              <InterfaceText text={{en: filter.title, he: filter.heTitle}} />&nbsp;
              <span className="filter-count"><InterfaceText>{`(${filter.docCount})`}</InterfaceText></span>
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
      <button className="showMore sans-serif" onClick={() => {setCutoff(cutoff + pageSize);}}>
        <InterfaceText>See More</InterfaceText>
      </button>
      : null}
    </>
  );
};


export default SearchFilters;