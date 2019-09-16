const React      = require('react');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
import Component      from 'react-class';


class CategoryFilter extends Component {
  // A clickable representation of category of connections, include counts.
  // If `showBooks` list connections broken down by book as well.
  handleClick(e) {
    e.preventDefault();
    if (this.props.showBooks) {
      this.props.setFilter(this.props.category, this.props.updateRecent);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Category Filter Click", this.props.category); }
    } else {
      this.props.setConnectionsCategory(this.props.category);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Connections Category Click", this.props.category); }
    }
  }
  render() {
    var filterSuffix = this.props.category  == "Quoting Commentary" ? "|Quoting" : null;
    var textFilters = this.props.showBooks ? this.props.books.map(function(book, i) {
     return (<TextFilter
                srefs={this.props.srefs}
                key={i}
                book={book.book}
                heBook={book.heBook}
                count={book.count}
                hasEnglish={book.hasEnglish}
                category={this.props.category}
                hideColors={true}
                updateRecent={true}
                filterSuffix={filterSuffix}
                setFilter={this.props.setFilter}
                on={Sefaria.util.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this)) : null;

    var color        = Sefaria.palette.categoryColor(this.props.category);
    var style        = {"borderTop": "4px solid " + color};
    var innerClasses = classNames({categoryFilter: 1, withBooks: this.props.showBooks, on: this.props.on});
    var count        = (<span className="connectionsCount"> ({this.props.count})</span>);
    var handleClick  = this.handleClick;
    var url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + this.props.category:"";
    var innerFilter = (
      <div className={innerClasses} data-name={this.props.category}>
        <span className="en">
          <span className="filterInner">
            <span className="filterText">{this.props.category}{count}</span>
            {this.props.hasEnglish ? <EnglishAvailableTag /> : null}
          </span>
        </span>
        <span className="he">{this.props.heCategory}{count}</span>
      </div>);
    var wrappedFilter = <a href={url} onClick={handleClick}>{innerFilter}</a>;
    var outerClasses = classNames({categoryFilterGroup: 1, withBooks: this.props.showBooks});
    return (
      <div className={outerClasses} style={style}>
        {wrappedFilter}
        {textFilters}
      </div>
    );
  }
}
CategoryFilter.propTypes = {
  srefs:                  PropTypes.array.isRequired,
  category:               PropTypes.string.isRequired,
  heCategory:             PropTypes.string.isRequired,
  showBooks:              PropTypes.bool.isRequired,
  count:                  PropTypes.number.isRequired,
  hasEnglish:             PropTypes.bool,
  books:                  PropTypes.array.isRequired,
  filter:                 PropTypes.array.isRequired,
  updateRecent:           PropTypes.bool.isRequired,
  setFilter:              PropTypes.func.isRequired,
  setConnectionsCategory: PropTypes.func.isRequired,
  on:                     PropTypes.bool,
};


class TextFilter extends Component {
  // A clickable representation of connections by Text or Commentator
  handleClick(e) {
    e.preventDefault();
    var filter = this.props.filterSuffix ? this.props.book + this.props.filterSuffix : this.props.book;
    this.props.setFilter(filter, this.props.updateRecent);
    if (Sefaria.site) {
      if (this.props.inRecentFilters) { Sefaria.track.event("Reader", "Text Filter in Recent Click", filter); }
      else { Sefaria.track.event("Reader", "Text Filter Click", filter); }
    }
  }
  render() {
    var classes = classNames({textFilter: 1, on: this.props.on, lowlight: this.props.count == 0});

    if (!this.props.hideColors) {
      var color = Sefaria.palette.categoryColor(this.props.category);
      var style = {"borderTop": "4px solid " + color};
    }
    var name = this.props.book == this.props.category ? this.props.book.toUpperCase() : this.props.book;
    var count = this.props.hideCounts || !this.props.count ? "" : ( <span className="connectionsCount">&nbsp;({this.props.count})</span>);
    var url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + name:"";
    const upperClass = classNames({uppercase: this.props.book === this.props.category});
    return (
      <a href={url} onClick={this.handleClick}>
        <div data-name={name} className={classes} style={style} >
            <div className={upperClass}>
              <span className="en">
                <span className="filterInner">
                  <span className="filterText">{name}{count}</span>
                  {this.props.hasEnglish ? <EnglishAvailableTag /> : null}
                </span>
              </span>
              <span className="he">{this.props.heBook}{count}</span>
            </div>
        </div>
      </a>
    );
  }
}
TextFilter.propTypes = {
  srefs:           PropTypes.array.isRequired,
  book:            PropTypes.string.isRequired,
  heBook:          PropTypes.string.isRequired,
  on:              PropTypes.bool.isRequired,
  setFilter:       PropTypes.func.isRequired,
  updateRecent:    PropTypes.bool,
  inRecentFilters: PropTypes.bool,
  filterSuffix:    PropTypes.string,  // Optionally add a string to the filter parameter set (but not displayed)
};


class EnglishAvailableTag extends Component {
  render() {
    return <span className="englishAvailableTag">EN</span>
  }
}

class RecentFilterSet extends Component {
  // A toggle-able listing of currently and recently used text filters.
  toggleAllFilterView() {
    this.setState({showAllFilters: !this.state.showAllFilters});
  }
  render() {
    // Annotate filter texts with category
    var recentFilters = this.props.recentFilters.map(function(filter) {
      var filterAndSuffix = filter.split("|");
      filter              = filterAndSuffix[0];
      var filterSuffix    = filterAndSuffix.length == 2 ? filterAndSuffix[1] : null;
      var index           = Sefaria.index(filter);
      return {
        book: filter,
        filterSuffix: filterSuffix,
        heBook: index ? index.heTitle : Sefaria.hebrewTerm(filter),
        category: index ? index.primary_category : filter
      };
    });
    var topLinks = [];
    // If the current filter is not already in the top set, put it first
    if (this.props.filter.length) {
      let filter = this.props.filter[0];
      for (var i=0; i < topLinks.length; i++) {
        if (recentFilters[i].book === filter ||
            recentFilters[i].category == filter ) { break; }
      }
      if (i == recentFilters.length) {
        var index = Sefaria.index(filter);
        if (index) {
          var annotatedFilter = {book: filter, heBook: index.heTitle, category: index.primary_category };
        } else {
          var annotatedFilter = {book: filter, heBook: filter.en, category: "Other" };
        }

        recentFilters = [annotatedFilter].concat(topLinks).slice(0,5);
      } else {
        // topLinks.move(i, 0);
      }
    }
    var recentFilters = recentFilters.map(function(book) {
     return (<TextFilter
                srefs={this.props.srefs}
                key={book.book}
                book={book.book}
                heBook={book.heBook}
                category={book.category}
                hideCounts={true}
                hideColors={true}
                count={book.count}
                filterSuffix={book.filterSuffix}
                updateRecent={false}
                inRecentFilters={true}
                setFilter={this.props.setFilter}
                on={Sefaria.util.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this));

    var classes = classNames({recentFilterSet: 1, topFilters: this.props.asHeader, filterSet: 1});
    return (
      <div className={classes}>
        <div className="topFiltersInner">{recentFilters}</div>
      </div>
    );
  }
}
RecentFilterSet.propTypes = {
  srefs:         PropTypes.array.isRequired,
  filter:        PropTypes.array.isRequired,
  recentFilters: PropTypes.array.isRequired,
  inHeader:      PropTypes.bool,
  setFilter:     PropTypes.func.isRequired,
};


module.exports.CategoryFilter  = CategoryFilter;
module.exports.RecentFilterSet = RecentFilterSet;
