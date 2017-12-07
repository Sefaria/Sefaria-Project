const {
  LoadingMessage,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const Sefaria    = require('./sefaria/sefaria');
const $          = require('./sefaria/sefariaJquery');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class SearchFilters extends Component {
  constructor(props) {
    super(props);

    this.state = {
      openedCategory: null,
      openedCategoryBooks: [],
      isExactSearch: props.optionField === props.exactField
    }
  }
  componentWillReceiveProps(newProps) {
    // Save current filters
    // this.props
    // todo: check for cases when we want to rebuild / not

    if ((newProps.query != this.props.query)
        || (newProps.availableFilters.length == 0)) {

      this.setState({
        openedCategory: null,
        openedCategoryBooks: [],
        isExactSearch: this.props.optionField === this.props.exactField
      });
    }
    // todo: logically, we should be unapplying filters as well.
    // Because we compute filter removal from teh same object, this ends up sliding in messily in the setState.
    // Hard to see how to get it through the front door.
      //if (this.state.openedCategory) {
      //   debugger;
      // }
     /*
   if (newProps.appliedFilters &&
              ((newProps.appliedFilters.length !== this.props.appliedFilters.length)
               || !(newProps.appliedFilters.every((v,i) => v === this.props.appliedFilters[i]))
              )
            ) {
      if (this.state.openedCategory) {
        this.handleFocusCategory(this.state.openedCategory);
      }
    } */
  }
  getSelectedTitles(lang) {
    var results = [];
    for (var i = 0; i < this.props.availableFilters.length; i++) {
        results = results.concat(this.props.availableFilters[i].getSelectedTitles(lang));
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
      this.props.updateAppliedOptionField(this.props.exactField);
    } else {
      this.props.updateAppliedOptionField(this.props.broadField);
    }
    this.setState({isExactSearch: newExactSearch});

  }
  _type_button(en_singular, en_plural, he_singular, he_plural, total, on_click, active) {
    // if (!total) { return "" }
      var total_with_commas = this._add_commas(total);
      var classes = classNames({"type-button": 1, active: active});

      return <div className={classes} onClick={on_click} onKeyPress={function(e) {e.charCode == 13 ? on_click(e):null}.bind(this)} role="button" tabIndex="0">
      <div className="type-button-total">
        {total_with_commas}
      </div>
      <div className="type-button-title">
        <span className="int-en">{(total != 1) ? en_plural : en_singular}</span>
        <span className="int-he">{(total != 1) ? he_plural : he_singular}</span>
      </div>
    </div>;
  }
  _add_commas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  render() {

    var runningQueryLine = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);

    var buttons = (
      <div className="type-buttons">
        {this._type_button("Text", "Texts", "מקור", "מקורות", this.props.textTotal, this.props.clickTextButton, (this.props.activeTab == "text"))}
        {this._type_button("Sheet", "Sheets", "דף מקורות", "דפי מקורות", this.props.sheetTotal, this.props.clickSheetButton, (this.props.activeTab == "sheet"))}
      </div>
    );

    var selected_filters = (<div className="results-count">
          <span className="int-en">
            {(!!this.props.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("en").join(", ")):""}
          </span>
          <span className="int-he">
            {(!!this.props.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("he").join(", ")):""}
          </span>
      </div>);
    var filter_panel = (<SearchFilterPanel
        toggleFilterView={this.props.toggleFilterView}
        toggleExactSearch={this.toggleExactSearch}
        displayFilters={this.props.displayFilters}
        availableFilters={this.props.availableFilters}
        openedCategory={this.state.openedCategory}
        openedCategoryBooks={this.state.openedCategoryBooks}
        updateAppliedFilter={this.props.updateAppliedFilter}
        query={this.props.query}
        closeBox={this.props.closeFilterView}
        isExactSearch={this.props.exactField === this.props.optionField}
        handleFocusCategory={this.handleFocusCategory}
        resetOpenedCategoryBooks={this.resetOpenedCategoryBooks}
    />);

    var sort_panel = (<SearchSortBox
          visible={this.props.displaySort}
          toggleSortView={this.props.toggleSortView}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          closeBox={this.props.closeSortView}
          sortType={this.props.sortType}/>);
    return (
      <div className={ classNames({searchTopMatter: 1, loading: this.props.isQueryRunning}) }>
        <div className="searchStatusLine">
          { (this.props.isQueryRunning) ? runningQueryLine : buttons }
          { (this.props.availableFilters.length > 0 && this.props.activeTab == "text") ? selected_filters : ""}
        </div>
        { ((true || this.props.availableFilters.length > 0) && this.props.activeTab == "text") ?
            (<div className="filterSortFlexbox">
              {filter_panel}
              {sort_panel}
            </div>)
            : "" }
      </div>);
  }
}
SearchFilters.propTypes = {
  query:                PropTypes.string,
  total:                PropTypes.number,
  textTotal:            PropTypes.number,
  sheetTotal:           PropTypes.number,
  appliedFilters:       PropTypes.array,
  availableFilters:     PropTypes.array,
  updateAppliedFilter:  PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort: PropTypes.func,
  exactField:           PropTypes.string,
  broadField:           PropTypes.string,
  optionField:          PropTypes.string,
  sortType:             PropTypes.string,
  isQueryRunning:       PropTypes.bool,
  activeTab:            PropTypes.string,
  clickTextButton:      PropTypes.func,
  clickSheetButton:     PropTypes.func,
  showResultsOverlay:   PropTypes.func,
  displayFilters:       PropTypes.bool,
  displaySort:          PropTypes.bool,
  toggleFilterView:     PropTypes.func,
  toggleSortView:       PropTypes.func,
  closeFilterView:      PropTypes.func,
  closeSortView:        PropTypes.func
};
SearchFilters.defaultProps = {
  appliedFilters: [],
  availableFilters: []
};


class SearchFilterPanel extends Component {
  componentDidMount() {
    document.addEventListener('mousedown', this.handleClickOutside, false);
  }
  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleClickOutside, false);
  }
  handleClickOutside(event) {
    const domNode = ReactDOM.findDOMNode(this);
    if ((!domNode || !domNode.contains(event.target)) && this.props.displayFilters) {
      this.props.closeBox();
    }
  }
  render() {
    return (<div>
      <div className="searchFilterToggle" tabIndex="0" onClick={this.props.toggleFilterView} onKeyPress={(e) => {e.charCode == 13 ? this.props.toggleFilterView(e):null}}>
        <span className="int-en">Filter</span>
        <span className="int-he">סינון</span>
        {(this.props.displayFilters) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
      </div>
      <div className={(this.props.displayFilters) ? "searchFilterBoxes":"searchFilterBoxes hidden"} role="dialog">
        <div className="searchFilterBoxRow">
          <div className="searchFilterCategoryBox">
          {this.props.availableFilters.map(function(filter) {
              return (<SearchFilter
                  filter={filter}
                  isInFocus={this.props.openedCategory === filter}
                  focusCategory={this.props.handleFocusCategory}
                  updateSelected={this.props.updateAppliedFilter}
                  closeBox={this.props.closeBox}
                  key={filter.path}/>);
          }.bind(this))}
          </div>
          <div className="searchFilterBookBox">
          {this.props.openedCategoryBooks.map(function(filter) {
              return (<SearchFilter
                  filter={filter}
                  openedCategory={this.props.openedCategory}
                  resetOpenedCategoryBooks={this.props.resetOpenedCategoryBooks}
                  updateSelected={this.props.updateAppliedFilter}
                  key={filter.path}/>);
          }.bind(this))}
          </div>
        </div>
        <div className={"searchFilterExactBox"}>
          <SearchFilterExactBox
            selected={this.props.isExactSearch}
            checkBoxClick={this.props.toggleExactSearch}
            />
        </div>
        <div style={{clear: "both"}}/>
      </div>
    </div>);
  }
}
SearchFilterPanel.propTypes = {
  toggleFilterView:    PropTypes.func,
  displayFilters:      PropTypes.bool,
  availableFilters:    PropTypes.array,
  openedCategory:      PropTypes.object,
  updateAppliedFilter: PropTypes.func,
  openedCategoryBooks: PropTypes.array,
  query:               PropTypes.string,
  isExactSearch:       PropTypes.bool,
  toggleExactSearch:   PropTypes.func,
  closeBox:            PropTypes.func,
  handleFocusCategory: PropTypes.func
};


class SearchSortBox extends Component {
  componentDidMount() {
    document.addEventListener('mousedown', this.handleClickOutside, false);
  }
  componentWillUnmount() {
    document.removeEventListener('mousedown', this.handleClickOutside, false);
  }
  handleClickOutside(event) {
    const domNode = ReactDOM.findDOMNode(this);

    if ((!domNode || !domNode.contains(event.target)) && this.props.visible) {
      this.props.closeBox();
    }
  }
  handleClick(sortType) {
    if (sortType === this.props.sortType) {
      return;
    }
    if (this.props.sortType === "chronological") {
      this.props.updateAppliedOptionSort("relevance");
    } else {
      this.props.updateAppliedOptionSort("chronological");
    }
    this.props.toggleSortView();
  }
  //<i className={(this.props.visible) ? "fa fa-caret-down fa-angle-down":"fa fa-caret-down fa-angle-up"} />
  render() {
    var chronoClass = classNames({'filter-title': 1, 'unselected': this.props.sortType !== "chronological"});
    var releClass = classNames({'filter-title': 1, 'unselected': this.props.sortType !== "relevance"});
    return (<div>
      <div className="searchFilterToggle" tabIndex="0" onClick={this.props.toggleSortView} onKeyPress={function(e) {e.charCode == 13 ? this.props.toggleSortView(e):null}.bind(this)}>
        <span className="int-en">Sort</span>
        <span className="int-he">מיון</span>
        {(this.props.visible) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}

      </div>
      <div className={(this.props.visible) ? "searchSortBox" :"searchSortBox hidden"}>
        <table>
          <tbody>
            <tr  className={releClass} onClick={()=>this.handleClick("relevance")} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.handleClick("relevance") :null}.bind(this)} aria-label="Sort by Relevance">
              <td>
                <img className="searchSortCheck" src="/static/img/check-mark.svg" alt="relevance sort selected"/>
              </td>
              <td>
                <span className="int-en">{"Relevance"}</span>
                <span className="int-he" dir="rtl">{"רלוונטיות"}</span>
              </td>
            </tr>
            <tr className={chronoClass} onClick={()=>this.handleClick("chronological")} tabIndex="0" onKeyPress={function(e) {e.charCode == 13 ? this.handleClick("chronological") :null}.bind(this)} aria-label="Sort Chronologically">
              <td>
                <img className="searchSortCheck" src="/static/img/check-mark.svg" alt="chronological sort selected"/>
              </td>
              <td>
                <span className="int-en">{"Chronological"}</span>
                <span className="int-he" dir="rtl">{"כרונולוגי"}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>);
  }
}
SearchSortBox.propTypes = {
  visible:                 PropTypes.bool,
  toggleSortView:          PropTypes.func,
  updateAppliedOptionSort: PropTypes.func,
  closeBox:                PropTypes.func,
  sortType:                PropTypes.oneOf(["chronological", "relevance"])
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
    return (<li>
      <input type="checkbox" id="searchFilterExactBox" className="filter" checked={this.props.selected} onChange={this.handleClick}/>
      <label tabIndex="0" onClick={this.handleClick} onKeyDown={this.handleKeyDown} onKeyPress={this.handleKeyPress}><span></span></label>
      <span className="int-en"><span className="filter-title">{"Exact search"}</span></span>
      <span className="int-he" dir="rtl"><span className="filter-title">{"חיפוש מדויק"}</span></span>
    </li>);
  }
}
SearchFilterExactBox.propTypes = {
  selected:      PropTypes.bool,
  checkBoxClick: PropTypes.func
};


class SearchFilter extends Component {
  constructor(props) {
    super(props);
    this.state = {selected: props.filter.selected};
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

    if ($(".searchFilterBookBox").children().length > 0 && !$('.searchFilterBookBox li label').is(':focus')) { // unoptimized code to focus on top of searchFilterBookBox when not previously selected. For a11y.
      $(".searchFilterBookBox").find(':focusable').first().focus();
    }

  }
  handleFilterClick(evt) {
    //evt.preventDefault();
    this.props.updateSelected(this.props.filter)
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
    if (e.keyCode === 27) { //27 is escape
      e.stopPropagation();
      if (this.props.closeBox) {
        this.props.closeBox()
      }
      else {
        $("#label-for-"+this.props.openedCategory.title).focus();
        this.props.resetOpenedCategoryBooks();
      }
    }
    else if (e.keyCode === 9) { //9 is tab
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
    return(
      <li onClick={this.handleFocusCategory}>
        <input type="checkbox" id={this.props.filter.path} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
        <label onClick={this.handleFilterClick} id={"label-for-"+this.props.filter.path} tabIndex="0" onKeyDown={this.handleKeyDown} onKeyPress={this.handleKeyPress} aria-label={"Click enter to toggle search filter for "+this.props.filter.title+" and space bar to toggle specific books in this category. Escape exits out of this modal"}><span></span></label>
        <span className="int-en"><span className="filter-title">{this.props.filter.title}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        <span className="int-he" dir="rtl"><span className="filter-title">{this.props.filter.heTitle}</span> <span className="filter-count">({this.props.filter.docCount})</span></span>
        {this.props.isInFocus?<span className="int-en"><i className="in-focus-arrow fa fa-caret-right"/></span>:""}
        {this.props.isInFocus?<span className="int-he"><i className="in-focus-arrow fa fa-caret-left"/></span>:""}
      </li>);
  }
}
SearchFilter.propTypes = {
  filter:         PropTypes.object.isRequired,
  isInFocus:      PropTypes.bool,
  updateSelected: PropTypes.func.isRequired,
  focusCategory:  PropTypes.func
};


module.exports = SearchFilters;
