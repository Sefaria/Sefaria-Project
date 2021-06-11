import React from 'react';
import ReactDOM from 'react-dom';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import SearchState from './sefaria/searchState';
import classNames  from 'classnames';
import PropTypes from 'prop-types';
import Component from 'react-class';
import {
  DropdownModal,
  DropdownButton,
  DropdownOptionList,
  InterfaceText,
  LoadingMessage,
} from './Misc';


class SearchFilters extends Component {
  constructor(props) {
    super(props);
    const hasFilters = props.searchState.availableFilters.length > 0;
    const openedCategory = hasFilters ? props.searchState.availableFilters[0] : null;
    this.state = {
      openedCategory,
      openedCategoryBooks: hasFilters ? openedCategory.getLeafNodes() : [],
      isExactSearch: props.searchState.field === props.searchState.fieldExact
    }
  }
  componentWillReceiveProps(newProps) {
    // Save current filters
    // todo: check for cases when we want to rebuild / not
    const { field, fieldExact } = this.props.searchState;
    if ((newProps.query != this.props.query)
        || (newProps.searchState.availableFilters.length !== this.props.searchState.availableFilters.length)) {

      const hasFilters = newProps.searchState.availableFilters.length > 0;
      const openedCategory = hasFilters ? newProps.searchState.availableFilters[0] : null;
      this.setState({
        openedCategory,
        openedCategoryBooks: hasFilters ? openedCategory.getLeafNodes() : [],
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
  handleFocusCategory(filterNode) {
    var leaves = filterNode.getLeafNodes();
    this.setState({
      openedCategory: filterNode,
      openedCategoryBooks: leaves
    })
  }
  resetOpenedCategoryBooks() {
    this.setState({
      openedCategoryBooks: []
    })
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
    /*
    var runningQueryLine = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);

    var selected_filters = (<div className="results-count">
          <span className="int-en">
            {(!!this.props.searchState.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("en").join(", ")):""}
          </span>
          <span className="int-he">
            {(!!this.props.searchState.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("he").join(", ")):""}
          </span>
      </div>);
    */
    const filters = (this.props.type === 'text' ?
      <TextSearchFilters
        toggleExactSearch={this.toggleExactSearch}
        openedCategory={this.state.openedCategory}
        openedCategoryBooks={this.state.openedCategoryBooks}
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
        isExactSearch={this.props.searchState.fieldExact === this.props.searchState.field}
        handleFocusCategory={this.handleFocusCategory}
        resetOpenedCategoryBooks={this.resetOpenedCategoryBooks}
      /> :
      <SheetSearchFilters
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
      />
    );

    return (
      <div className="searchFilters navSidebarModule">
        {filters}
      </div>
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
      <div className="searchFilterBoxes" role="dialog">
        <h2>
          <InterfaceText>Text</InterfaceText>
        </h2>
        <div className="searchFilterTextBox">
          {this.props.availableFilters.map(filter => {
            return (
              <SearchFilter
                filter={filter}
                isInFocus={this.props.openedCategory === filter}
                focusCategory={this.props.handleFocusCategory}
                updateSelected={this.props.updateAppliedFilter}
                expandable={true}
                key={filter.aggKey}/>
            );
          })}
        </div>

        <h2>
          <InterfaceText>Options</InterfaceText>
        </h2>
        <div className="searchFilterExactBox">
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
  handleFocusCategory: PropTypes.func,
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
  handleKeyDown(e) {
    if (e.keyCode === 9) { //9 is tab
      e.stopPropagation();
      var lastTab = $("div[role='dialog']").find(':tabbable').last();
      var firstTab = $("div[role='dialog']").find(':tabbable').first();
      if (e.shiftKey) {
        if ($(e.target).is(firstTab)) {
          $(lastTab).focus();
          e.preventDefault();
        }
      }
      else {
        if ($(e.target).is(lastTab)) {
          $(firstTab).focus();
          e.preventDefault();
        }
      }
    }
  }
  render() {
    return (
      <li>
        <input type="checkbox" id="searchFilterExactBox" className="filter" checked={this.props.selected} onChange={this.handleClick}/>
        <label tabIndex="0" onClick={this.handleClick} onKeyDown={this.handleKeyDown} onKeyPress={this.handleKeyPress}><span></span></label>
        
        <span className={"filter-title"}>
          <InterfaceText>Exact Matches Only</InterfaceText>
        </span>
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
  // Can't set indeterminate in the render phase.  https://github.com/facebook/react/issues/1798
  componentDidMount() {
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

    /* TODO verify no longer needed
    if ($(".searchFilterBookBox").children().length > 0 && !$('.searchFilterBookBox li label').is(':focus')) { // unoptimized code to focus on top of searchFilterBookBox when not previously selected. For a11y.
      $(".searchFilterBookBox").find(':focusable').first().focus();
    }
    */
  }
  handleFilterClick(evt) {
    this.props.updateSelected(this.props.filter)
  }
  toggleExpanded() {
    this.props.expandable && this.setState({expanded: !this.state.expanded});    
  }
  handleFocusCategory() {
    if (this.props.focusCategory) {
      this.props.focusCategory(this.props.filter)
    }
  }
  handleKeyPress(e) {
    if (e.charCode == 13) { // enter
      this.handleFilterClick(e);
    }
    else if (e.charCode == 32) { //space
      e.preventDefault();
      this.handleFocusCategory(e);
    }
  }
  handleKeyDown(e) {
    if (e.keyCode === 9) { //9 is tab
      e.stopPropagation();
      var lastTab = $("div[role='dialog']").find(':tabbable').last();
      var firstTab = $("div[role='dialog']").find(':tabbable').first();
      if (e.shiftKey) {
        if ($(e.target).is(firstTab)) {
          $(lastTab).focus();
          e.preventDefault();
        }
      }
      else {
        if ($(e.target).is(lastTab)) {
          $(firstTab).focus();
          e.preventDefault();
        }
      }
    }   
  }
  render() {
    const { filter, isInFocus } = this.props;
    return (
      <>
        <li className={classNames({active: isInFocus})}>
          <div className="checkboxAndText">
            <input type="checkbox" id={filter.aggKey} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
            <label 
              onClick={this.handleFilterClick} 
              id={"label-for-"+this.props.filter.aggKey} 
              tabIndex="0" onKeyDown={this.handleKeyDown} 
              onKeyPress={this.handleKeyPress} 
              aria-label={"Click enter to toggle search filter for "+filter.title+" and space bar to toggle specific books in this category. Escape exits out of this modal"}>
              <span></span>
            </label>
            <span className="searchFilterTitle" onClick={this.toggleExpanded}>
              <InterfaceText text={{en: filter.title, he: filter.heTitle}} />&nbsp;
              <span className="filter-count"><InterfaceText>{`(${filter.docCount})`}</InterfaceText></span>
            </span>
          </div>
          {this.props.expandable ? <i className="fa fa-angle-down" /> : null}
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
  isInFocus:      PropTypes.bool,
  updateSelected: PropTypes.func.isRequired,
  focusCategory:  PropTypes.func,
};


class SheetSearchFilters extends Component {
  render() {
    const collectionFilters = this.props.availableFilters.filter(filter => filter.aggType === 'collections' && filter.title);
    const tagFilters = this.props.availableFilters.filter(filter => filter.aggType.match(/^topics/));

    return (
      <div className="searchFilterBoxes" role="dialog">
        <h2>
          <InterfaceText>Topics</InterfaceText>
        </h2>
        <div className="searchFilterCategoryBox searchFilterSheetBox">
          {tagFilters.map(filter => (
          <SearchFilter
            filter={filter}
            updateSelected={this.props.updateAppliedFilter}
            key={filter.aggKey} />
          ))}
        </div>

        <h2>
          <InterfaceText>Collections</InterfaceText>
        </h2>
        <div className="searchFilterCategoryBox searchFilterSheetBox">
          {collectionFilters.map(filter => (
          <SearchFilter
            filter={filter}
            isInFocus={false}
            updateSelected={this.props.updateAppliedFilter}
            key={filter.aggKey} />
          ))}
        </div>
      </div>
    );
  }
}
SheetSearchFilters.propTypes = {
  updateAppliedFilter: PropTypes.func.isRequired,
  availableFilters:    PropTypes.array.isRequired,
};


export default SearchFilters;