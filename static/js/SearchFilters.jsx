const {
  LoadingMessage,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const Sefaria    = require('./sefaria/sefaria');
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

      return <div className={classes} onClick={on_click}>
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
      <div className="searchFilterToggle" onClick={this.props.toggleFilterView}>
        <span className="int-en">Filter</span>
        <span className="int-he">סינון</span>
        {(this.props.displayFilters) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}
      </div>
      <div className={(this.props.displayFilters) ? "searchFilterBoxes":"searchFilterBoxes hidden"}>
        <div className="searchFilterBoxRow">
          <div className="searchFilterCategoryBox">
          {this.props.availableFilters.map(function(filter) {
              return (<SearchFilter
                  filter={filter}
                  isInFocus={this.props.openedCategory === filter}
                  focusCategory={this.props.handleFocusCategory}
                  updateSelected={this.props.updateAppliedFilter}
                  key={filter.path}/>);
          }.bind(this))}
          </div>
          <div className="searchFilterBookBox">
          {this.props.openedCategoryBooks.map(function(filter) {
              return (<SearchFilter
                  filter={filter}
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
      <div className="searchFilterToggle" onClick={this.props.toggleSortView}>
        <span className="int-en">Sort</span>
        <span className="int-he">מיון</span>
        {(this.props.visible) ? <img src="/static/img/arrow-up.png" alt=""/> : <img src="/static/img/arrow-down.png" alt=""/>}

      </div>
      <div className={(this.props.visible) ? "searchSortBox" :"searchSortBox hidden"}>
        <table>
          <tbody>
            <tr  className={releClass} onClick={()=>this.handleClick("relevance")}>
              <td>
                <img className="searchSortCheck" src="/static/img/check-mark.svg" alt="relevance sort selected"/>
              </td>
              <td>
                <span className="int-en">{"Relevance"}</span>
                <span className="int-he" dir="rtl">{"רלוונטיות"}</span>
              </td>
            </tr>
            <tr className={chronoClass} onClick={()=>this.handleClick("chronological")}>
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
  render() {
    return (<li>
      <input type="checkbox" id="searchFilterExactBox" className="filter" checked={this.props.selected} onChange={this.handleClick}/>
      <label onClick={this.handleClick}><span></span></label>
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
  }
  componentDidUpdate() {
    ReactDOM.findDOMNode(this).querySelector("input").indeterminate = this.props.filter.isPartial();
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
  render() {
    return(
      <li onClick={this.handleFocusCategory}>
        <input type="checkbox" id={this.props.filter.path} className="filter" checked={this.state.selected == 1} onChange={this.handleFilterClick}/>
        <label onClick={this.handleFilterClick}><span></span></label>
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
