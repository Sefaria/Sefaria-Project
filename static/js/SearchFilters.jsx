import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
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
    if ((newProps.query != this.props.query)
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
      ariaLabel: Sefaria._("Sort by") + " " + Sefaria._(data.name),
    }));

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
          <div className="searchFilterGroup">
            <h2>
              <InterfaceText>Sort by</InterfaceText>
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
          filters={this.props.availableFilters}
          updateSelected={this.props.updateAppliedFilter}
          expandable={true} />

        <div className="searchFilterGroup">
          <h2>
            <InterfaceText>Options</InterfaceText>
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

  let content = displayedFilters.map(filter => (
    <SearchFilter
      filter={filter}
      updateSelected={updateSelected}
      expandable={expandable}
      key={filter.aggKey}/>
  ));

  if (paged) {
    content = <PagedList items={content} />
  }

  const beginsWithStringOrSelected = (item, filterValue) => {
    if (item.selected || item.title.toLowerCase().startsWith(filterValue.toLowerCase()) || item.heTitle.startsWith(filterValue)) {
      return true;
    } else {
      return false;
    }
  }

  const updateFilters = text => {
    if (text && text != "") {
      setFilters(filters.filter(x => beginsWithStringOrSelected(x, text)));
    } else {
      setFilters(filters);
    }
  }
  // need hebrew for placeholder/title
  const search = searchable ? <input class="searchBox" id={`filter${name}`} placeholder={Sefaria._(`Search ${name}`)} title={`Type to Filter ${name} Shown`} onChange={e => updateFilters(e.target.value)}></input> : null;

  return (
    <div className="searchFilterGroup">
      <h2>
        <InterfaceText context="SearchFilters">{name}</InterfaceText>
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
    if (e.charCode == 13) { // enter
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
            <InterfaceText>Exact Matches Only</InterfaceText>
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
  handleKeyPress(e) {
    if (e.charCode == 13) { // enter
      this.handleFilterClick(e);
    }
  }
  handleExpandKeyPress(e) {
    if (e.charCode == 13) { // enter
      this.toggleExpanded();
    }
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
        {this.state.expanded ? 
        <li>
          <div className="searchFilterBooks">
            {filter.getLeafNodes().map(subFilter => (
              <SearchFilter
                filter={subFilter}
                updateSelected={this.props.updateSelected}
                key={filter.aggKey} />
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
    const collectionFilters = this.props.availableFilters.filter(filter => filter.aggType === 'collections' && filter.title);
    const tagFilters = this.props.availableFilters.filter(filter => filter.aggType.match(/^topics/) && filter.title);

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
      <a href="javascript:void(0);" className="showMore sans-serif" onClick={() => {setCutoff(cutoff + pageSize);}}>
        <InterfaceText>See More</InterfaceText>
      </a>
      : null}
    </>
  );
};


export default SearchFilters;