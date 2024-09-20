import React from 'react';
import Sefaria from './sefaria/sefaria';
import classNames from 'classnames';
import PropTypes from 'prop-types';
import Component      from 'react-class';
import {ContentText} from "./ContentText";



class CategoryFilter extends Component {
  // A clickable representation of category of connections, include counts.
  // If `showBooks` list connections broken down by book as well.
  handleClick(e) {
    e.preventDefault();
    if (this.props.showBooks) { // 2nd level
      this.props.setFilter(this.props.category, this.props.updateRecent);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Category Filter Click", this.props.category); }
    } else { // top level
      this.props.setConnectionsCategory(this.props.category);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Connections Category Click", this.props.category); }
    }
  }
  render() {
    
    const filterSuffix = this.props.category  === "Quoting Commentary" ? "Quoting" : null;
    const textMissingDescription = null; //"missing description"
    const textFilters = this.props.showBooks ? this.props.books.map(function(book, i) {
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
                description={book.enShortDesc ? book.enShortDesc: textMissingDescription}
                heDescription={book.heShortDesc ? book.heShortDesc: textMissingDescription}
                on={Sefaria.util.inArray(book.book, this.props.filter) !== -1} />);
    }.bind(this)) : null;

    const color        = Sefaria.palette.categoryColor(this.props.category);
    const style       = {"--category-color":color}
    let innerClasses = classNames({categoryFilter: 1, withBooks: this.props.showBooks, on: this.props.on});
    let handleClick  = this.handleClick;
    const categoryForUrl = !this.props.showBooks ? this.props.category + " ConnectionsList" : this.props.category;
    const url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + categoryForUrl :"";
    const classesDesc = classNames({ sidebarDescription: 1, lowlight: this.props.count === 0, title:1});
    let outerClasses = classNames({categoryFilterGroup: 1, withBooks: this.props.showBooks});
    const catDesc = Sefaria.getDescriptionDict(this.props.category, []);
    const catEnDesc = catDesc[0];
    const catHeDesc = catDesc[1];
    return (
      <div className={outerClasses} style={style}>
        <a href={url} onClick={handleClick}>
          <div className={innerClasses} data-name={this.props.category}>
            <span className="filterInner">
              <span className="filterText">
                <ContentText text={{en:this.props.showBooks ? `${Sefaria._("common.all")} ${this.props.category}` : this.props.category, he:this.props.showBooks ? `${Sefaria._("common.all")} ${this.props.heCategory}` : this.props.heCategory}} />
                <span className="connectionsCount"> ({this.props.count})</span>
              </span>
              <span className="en">
                {this.props.hasEnglish && Sefaria._siteSettings.TORAH_SPECIFIC ? <EnglishAvailableTag /> : null}
              </span>
            </span>
          <div className={classesDesc}>{catEnDesc || catHeDesc ?
                              <ContentText text={{en: catEnDesc, he: catHeDesc}} />
                      : null }</div>          </div>
        </a>
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
    const name = "enDisplayText" in this.props ? this.props["enDisplayText"] : this.props.book;
    let filter = this.props.filterSuffix ? name + "|" + this.props.filterSuffix : name;
    this.props.setFilter(filter, this.props.updateRecent);
    if (Sefaria.site) {
      if (this.props.inRecentFilters) { Sefaria.track.event("Reader", "Text Filter in Recent Click", filter); }
      else { Sefaria.track.event("Reader", "Text Filter Click", filter); }
    }
  }
  render() {
    const classes = classNames({textFilter: 1, on: this.props.on, lowlight: this.props.count === 0});
    const classesDesc = classNames({ sidebarDescription: 1, lowlight: this.props.count === 0});
    const color = this.props.filterSuffix === "Essay" ? "var(--essay-links-green)" : Sefaria.palette.categoryColor(this.props.category);
    const style = {"--category-color": color};
    const enBook = this.props.book === this.props.category ? this.props.book.toUpperCase() : this.props.book;
    const showCount = !this.props.hideCounts && !!this.props.count;
    const url = (this.props.srefs && this.props.srefs.length > 0)?"/" + Sefaria.normRef(this.props.srefs[0]) + "?with=" + enBook:"";
    const upperClass = classNames({uppercase: this.props.book === this.props.category});
    const name = "enDisplayText" in this.props ? this.props["enDisplayText"] : enBook;
    const heName = "heDisplayText" in this.props ? this.props["heDisplayText"] : this.props.heBook;
    const enDesc = this.props.description
    const heDesc = this.props.heDescription
    const showDescription = true; //showCount;//
    return (
      <a href={url} onClick={this.handleClick}>
        <div data-name={enBook} className={classes} style={style} >
            <div className={upperClass}>
                <span className="filterInner">
                  <span className="filterText">
                    <ContentText text={{en: name, he: heName }} />
                    {showCount ? <span className="connectionsCount">&nbsp;({this.props.count})</span> : null}
                  </span>
                  <span className="en">
                    {this.props.hasEnglish && Sefaria._siteSettings.TORAH_SPECIFIC ? <EnglishAvailableTag /> : null}
                  </span>
                </span>
              {showDescription ?<div className={classesDesc}>{enDesc || heDesc ?
                              <ContentText text={{en: enDesc, he: heDesc}} />
                      : null }</div> : null}
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
  enDisplayedText: PropTypes.string,  // displayedText fields used when link is 'essay' and we don't want to show the book title
  heDisplayedText: PropTypes.string,
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
    let recentFilters;
    recentFilters = this.props.recentFilters.map(function(filter) {
      let filterAndSuffix = filter.split("|");
      filter              = filterAndSuffix[0];
      let filterSuffix    = filterAndSuffix.length === 2 ? filterAndSuffix[1] : null;
      let index           = Sefaria.index(filter);
      const filterKey       = filter + (filterSuffix ? `|${filterSuffix}` : '');
      return {
        book: filter,
        filterSuffix,
        heBook: index ? index.heTitle : Sefaria.hebrewTerm(filter),
        category: index ? (index.primary_category ? index.primary_category : index.categories[0]) : filter,
        filterKey,
      };
    });
    let topLinks = [];
    // If the current filter is not already in the top set, put it first
    if (this.props.filter.length) {
      let filter = this.props.filter[0];
      let i = 0;
      for (i; i < topLinks.length; i++) {
        if (recentFilters[i].book === filter ||
            recentFilters[i].category === filter ) { break; }
      }
      if (i === recentFilters.length) {
        let index = Sefaria.index(filter);
        let annotatedFilter;
        if (index) {
          annotatedFilter = {book: filter, heBook: index.heTitle, category: index.primary_category };
        } else {
          annotatedFilter = {book: filter, heBook: filter.en, category: "Other" };
        }

        recentFilters = [annotatedFilter].concat(topLinks).slice(0,5);
      } else {
        // topLinks.move(i, 0);
      }
    }
    recentFilters = recentFilters.map(function(book) {
     return (<TextFilter
                srefs={this.props.srefs}
                key={book.filterKey}
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
                on={Sefaria.util.inArray(book.filterKey, this.props.filter) !== -1} />);
    }.bind(this));

    let classes = classNames({recentFilterSet: 1, topFilters: this.props.asHeader, filterSet: 1});
    return (
      <div className={classes}>
        <div className="topFiltersInner">{recentFilters}</div>
      </div>
    );
  }
}
RecentFilterSet.propTypes = {
  srefs:              PropTypes.array.isRequired,
  filter:             PropTypes.array.isRequired,
  recentFilters:      PropTypes.array.isRequired,
  inHeader:           PropTypes.bool,
  setFilter:          PropTypes.func.isRequired,
};

export {
  CategoryFilter,
  RecentFilterSet,
  TextFilter
};
