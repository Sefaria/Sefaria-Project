const {
  DropdownModal,
  LoadingMessage,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const Sefaria    = require('./sefaria/sefaria');
const $          = require('./sefaria/sefariaJquery');
const SearchState= require('./sefaria/searchState');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class SearchFilters extends Component {
  constructor(props) {
    super(props);

    this.state = {
      openedCategory: null,
      openedCategoryBooks: [],
      isExactSearch: props.searchState.field === props.searchState.fieldExact
    }
  }
  componentWillReceiveProps(newProps) {
    // Save current filters
    // this.props
    // todo: check for cases when we want to rebuild / not
    const { field, fieldExact } = this.props.searchState;
    if ((newProps.query != this.props.query)
        || (newProps.searchState.availableFilters.length == 0)) {

      this.setState({
        openedCategory: null,
        openedCategoryBooks: [],
        isExactSearch: field === fieldExact
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
    let results = [];
    for (let i = 0; i < this.props.searchState.availableFilters.length; i++) {
        results = results.concat(this.props.searchState.availableFilters[i].getSelectedTitles(lang));
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
  _type_button(en, he, total, on_click, active) {
    // if (!total) { return "" }
      var total_with_commas = this._add_commas(total);
      var classes = classNames({"search-dropdown-button": 1, active});

      return (
        <div className={classes} onClick={on_click} onKeyPress={function(e) {e.charCode == 13 ? on_click(e):null}.bind(this)} role="button" tabIndex="0">
          <div className="type-button-title">
            <span className="int-en">{`${en} (${total})`}</span>
            <span className="int-he">{`${he} (${total})`}</span>
          </div>
        </div>
      );
  }
  _add_commas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  render() {

    var runningQueryLine = (<LoadingMessage message="Searching..." heMessage="מבצע חיפוש..." />);

    var buttons = (
      <div className="type-buttons">
        {this._type_button("Texts", "טקסטים", this.props.textTotal, this.props.clickTextButton, (this.props.type == "text"))}
        {this._type_button("Sheets", "דפי מקורות", this.props.sheetTotal, this.props.clickSheetButton, (this.props.type == "sheet"))}
      </div>
    );

    var selected_filters = (<div className="results-count">
          <span className="int-en">
            {(!!this.props.searchState.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("en").join(", ")):""}
          </span>
          <span className="int-he">
            {(!!this.props.searchState.appliedFilters.length && !!this.props.total)?(this.getSelectedTitles("he").join(", ")):""}
          </span>
      </div>);
    const filter_panel = (this.props.type === 'text' ?
      <TextSearchFilterPanel
        toggleFilterView={this.props.toggleFilterView}
        toggleExactSearch={this.toggleExactSearch}
        displayFilters={this.props.displayFilters}
        openedCategory={this.state.openedCategory}
        openedCategoryBooks={this.state.openedCategoryBooks}
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
        closeBox={this.props.closeFilterView}
        isExactSearch={this.props.searchState.fieldExact === this.props.searchState.field}
        handleFocusCategory={this.handleFocusCategory}
        resetOpenedCategoryBooks={this.resetOpenedCategoryBooks}
      /> :
      <SheetSearchFilterPanel
        toggleFilterView={this.props.toggleFilterView}
        displayFilters={this.props.displayFilters}
        updateAppliedFilter={this.props.updateAppliedFilter}
        availableFilters={this.props.searchState.availableFilters}
        closeBox={this.props.closeFilterView}
      />
    );

    var sort_panel = (<SearchSortBox
          type={this.props.type}
          visible={this.props.displaySort}
          toggleSortView={this.props.toggleSortView}
          updateAppliedOptionSort={this.props.updateAppliedOptionSort}
          closeBox={this.props.closeSortView}
          sortType={this.props.searchState.sortType}/>);
    return (
      <div className="searchTopMatter">
        <div className="searchStatusLine">
          { (this.props.isQueryRunning) ? runningQueryLine : null }
          { (this.props.searchState.availableFilters.length > 0 && this.props.type == "text") ? selected_filters : ""}
        </div>
        <div className="searchButtonsBar">
          { buttons }
          <div className="filterSortFlexbox">
            {filter_panel}
            {sort_panel}
          </div>
        </div>
      </div>);
  }
}
SearchFilters.propTypes = {
  query:                PropTypes.string,
  searchState:          PropTypes.object,
  total:                PropTypes.number,
  textTotal:            PropTypes.number,
  sheetTotal:           PropTypes.number,
  updateAppliedFilter:  PropTypes.func,
  updateAppliedOptionField: PropTypes.func,
  updateAppliedOptionSort: PropTypes.func,
  isQueryRunning:       PropTypes.bool,
  type:            PropTypes.string,
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


class SearchDropdownButton extends Component {
  render() {
    const { isOpen, toggle, enText, heText } = this.props;
    const filterTextClasses = classNames({ searchFilterToggle: 1, active: isOpen });
    return (
      <div className={ filterTextClasses } tabIndex="0" onClick={toggle} onKeyPress={(e) => {e.charCode == 13 ? toggle(e):null}}>
        <span className="int-en">{enText}</span>
        <span className="int-he">{heText}</span>
        {isOpen ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
      </div>
    )
  }
}
SearchDropdownButton.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
  enText: PropTypes.string.isRequired,
  heText: PropTypes.string.isRequired,
}


class SheetSearchFilterPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeTab: 'groups',
    }
  }
  clickGroupTab(e) {
    this.changeTab('groups');
  }
  clickTagTab(e) {
    this.changeTab('tags')
  }
  changeTab(tab) {
    if (this.state.activeTab !== tab) {
      this.setState({activeTab: tab});
    }
  }
  render() {
    const groupFilters = this.props.availableFilters.filter(filter => filter.aggType === 'group');
    const tagFilters = this.props.availableFilters.filter(filter => filter.aggType === 'tags');
    const groupTabClasses = classNames({'search-dropdown-button': 1, active: this.state.activeTab === 'groups'});
    const tagTabClasses = classNames({'search-dropdown-button': 1, active: this.state.activeTab === 'tags'});

    return (
      <DropdownModal close={this.props.closeBox} isOpen={this.props.displayFilters}>
        <SearchDropdownButton
          isOpen={this.props.displayFilters}
          toggle={this.props.toggleFilterView}
          enText={"Filter"}
          heText={"סינון"}
        />
        <div className={(this.props.displayFilters) ? "searchFilterBoxes":"searchFilterBoxes hidden"} role="dialog">
          <div className="searchFilterTabRow">
            <div className={groupTabClasses} onClick={this.clickGroupTab}>
              <span className="int-en">Groups</span>
              <span className="int-he" dir="rtl">קבוצות</span>
            </div>
            <div className={tagTabClasses} onClick={this.clickTagTab}>
              <span className="int-en">Tags</span>
              <span className="int-he" dir="rtl">תויות</span>
            </div>
          </div>
          { this.state.activeTab === 'groups' ?
            <div className="searchFilterCategoryBox searchFilterSheetBox">
            {groupFilters.map(filter => (
                  <SearchFilter
                    filter={filter}
                    isInFocus={false}
                    updateSelected={this.props.updateAppliedFilter}
                    closeBox={this.props.closeBox}
                    key={filter.aggKey}
                  />
                )
            )}
            </div> :
            <div className="searchFilterCategoryBox searchFilterSheetBox tag-filter-outer">
              {tagFilters.map(filter => (
                <SearchTagFilter
                  filter={filter}
                  updateSelected={this.props.updateAppliedFilter}
                  key={filter.aggKey}
                />
              ))}
            </div>
          }
        </div>
      </DropdownModal>
    );
  }
}
SheetSearchFilterPanel.propTypes = {
  toggleFilterView:    PropTypes.func.isRequired,
  displayFilters:      PropTypes.bool.isRequired,
  updateAppliedFilter: PropTypes.func.isRequired,
  availableFilters:    PropTypes.array.isRequired,
  closeBox:            PropTypes.func.isRequired,
};

class TextSearchFilterPanel extends Component {
  render() {
    return (
      <DropdownModal close={this.props.closeBox} isOpen={this.props.displayFilters}>
        <SearchDropdownButton
          isOpen={this.props.displayFilters}
          toggle={this.props.toggleFilterView}
          enText={"Filter"}
          heText={"סינון"}
        />
        <div className={(this.props.displayFilters) ? "searchFilterBoxes":"searchFilterBoxes hidden"} role="dialog">
          <div className="searchFilterBoxRow">
            <div className="searchFilterCategoryBox">
            {this.props.availableFilters.map(filter => {
                return (<SearchFilter
                    filter={filter}
                    isInFocus={this.props.openedCategory === filter}
                    focusCategory={this.props.handleFocusCategory}
                    updateSelected={this.props.updateAppliedFilter}
                    closeBox={this.props.closeBox}
                    key={filter.aggKey}/>);
            })}
            </div>
            <div className="searchFilterBookBox">
            {this.props.openedCategoryBooks.map(function(filter) {
                return (<SearchFilter
                    filter={filter}
                    openedCategory={this.props.openedCategory}
                    resetOpenedCategoryBooks={this.props.resetOpenedCategoryBooks}
                    updateSelected={this.props.updateAppliedFilter}
                    key={filter.aggKey}/>);
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
      </DropdownModal>
    );
  }
}
TextSearchFilterPanel.propTypes = {
  toggleFilterView:    PropTypes.func,
  displayFilters:      PropTypes.bool,
  availableFilters:    PropTypes.array,
  openedCategory:      PropTypes.object,
  updateAppliedFilter: PropTypes.func,
  openedCategoryBooks: PropTypes.array,
  isExactSearch:       PropTypes.bool,
  toggleExactSearch:   PropTypes.func,
  closeBox:            PropTypes.func,
  handleFocusCategory: PropTypes.func
};


class SearchSortBox extends Component {
  handleClick(sortType) {
    if (sortType === this.props.sortType) {
      return;
    }
    this.props.updateAppliedOptionSort(sortType);
    this.props.toggleSortView();
  }
  //<i className={(this.props.visible) ? "fa fa-caret-down fa-angle-down":"fa fa-caret-down fa-angle-up"} />
  render() {
    const filterTextClasses = classNames({ searchFilterToggle: 1, active: this.props.visible });
    return (<DropdownModal close={this.props.closeBox} isOpen={this.props.visible}>
      <SearchDropdownButton
        isOpen={this.props.visible}
        toggle={this.props.toggleSortView}
        enText={"Sort"}
        heText={"מיון"}
      />
      <div className={(this.props.visible) ? "searchSortBox" :"searchSortBox hidden"}>
        <table>
          <tbody>
            {
              SearchState.metadataByType[this.props.type].sortTypeArray.map( (sortTypeObj, iSortTypeObj) => {
                const tempClasses = classNames({'filter-title': 1, unselected: this.props.sortType !== sortTypeObj.type});
                return (
                  <tr key={`${this.props.type}|${sortTypeObj.type}`} className={tempClasses} onClick={()=>{ this.handleClick(sortTypeObj.type); }} tabIndex={`${iSortTypeObj}`} onKeyPress={e => {e.charCode == 13 ? this.handleClick(sortTypeObj.type) : null}} aria-label={`Sort by ${sortTypeObj.name}`}>
                    <td>
                      <img className="searchSortCheck" src="/static/img/check-mark.svg" alt={`${sortTypeObj.name} sort selected`}/>
                    </td>
                    <td>
                      <span className="int-en">{sortTypeObj.name}</span>
                      <span className="int-he" dir="rtl">{sortTypeObj.heName}</span>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    </DropdownModal>);
  }
}
SearchSortBox.propTypes = {
  type:                    PropTypes.string.isRequired,
  visible:                 PropTypes.bool,
  toggleSortView:          PropTypes.func,
  updateAppliedOptionSort: PropTypes.func,
  closeBox:                PropTypes.func,
  sortType:                PropTypes.string,
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


class SearchTagFilter extends Component {
  constructor(props) {
    super(props);
    this.state = {selected: props.filter.selected};
  }
  componentWillReceiveProps(newProps) {
    if (newProps.filter.selected != this.state.selected) {
      this.setState({selected: newProps.filter.selected});
    }
  }
  handleClick(evt) {
    //evt.preventDefault();
    this.props.updateSelected(this.props.filter, 'tags')
  }
  handleKeyPress(e) {
    if (e.charCode == 13) { // enter
      this.handleFilterClick(e);
    }
  }
  render() {
    const { filter } = this.props;
    let enTitle = filter.title || filter.heTitle;
    enTitle = enTitle || '(No Tag)';
    const enTitleIsHe = !filter.title && !!filter.heTitle;
    let heTitle = filter.heTitle || filter.title;
    heTitle = heTitle || '(ללא תוית)';
    const heTitleIsEn = !filter.heTitle && !!filter.title;

    const classes = classNames({"type-button": 1, "tag-filter": 1, active: this.state.selected === 1})
    return (
      <div className={classes} onClick={this.handleClick}>
        <span className="int-en" dir={enTitleIsHe ? 'rtl' : 'ltr'}><span className="filter-title">{enTitle}</span> <span className="filter-count">({filter.docCount})</span></span>
        <span className="int-he" dir={heTitleIsEn ? 'ltr' : 'rtl'}><span className="filter-title">{heTitle}</span> <span className="filter-count">({filter.docCount})</span></span>
      </div>
    )
  }
}
SearchTagFilter.propTypes = {
  updateSelected: PropTypes.func.isRequired,
  filter:         PropTypes.object.isRequired,
}

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
    const { filter, isInFocus } = this.props;
    let enTitle = filter.title || filter.heTitle;
    enTitle = enTitle || '(No Group)';
    const enTitleIsHe = !filter.title && !!filter.heTitle;
    let heTitle = filter.heTitle || filter.title;
    heTitle = heTitle || '(בלי קבוצה)';
    const heTitleIsEn = !filter.heTitle && !!filter.title;
    return(
      <li onClick={this.handleFocusCategory}>
        <input type="checkbox" id={filter.aggKey} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
        <label onClick={this.handleFilterClick} id={"label-for-"+this.props.filter.aggKey} tabIndex="0" onKeyDown={this.handleKeyDown} onKeyPress={this.handleKeyPress} aria-label={"Click enter to toggle search filter for "+filter.title+" and space bar to toggle specific books in this category. Escape exits out of this modal"}><span></span></label>
        <span className="int-en" dir={enTitleIsHe ? 'rtl' : 'ltr'}><span className="filter-title">{enTitle}</span> <span className="filter-count">({filter.docCount})</span></span>
        <span className="int-he" dir={heTitleIsEn ? 'ltr' : 'rtl'}><span className="filter-title">{heTitle}</span> <span className="filter-count">({filter.docCount})</span></span>
        {isInFocus?<span className="int-en"><i className="in-focus-arrow fa fa-caret-right"/></span>:""}
        {isInFocus?<span className="int-he"><i className="in-focus-arrow fa fa-caret-left"/></span>:""}
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
