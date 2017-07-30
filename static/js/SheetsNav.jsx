const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  LoadingMessage,
  TwoOrThreeBox,
}                = require('./Misc');
const React      = require('react');
const ReactDOM   = require('react-dom');
const $          = require('./sefaria/sefariaJquery');
const Sefaria    = require('./sefaria/sefaria');
const classNames = require('classnames');
const PropTypes  = require('prop-types');
const GroupPage  = require('./GroupPage');
const Footer     = require('./Footer');
import Component from 'react-class';

class SheetsNav extends Component {
  // Navigation for Sheets
  constructor(props) {
    super(props);
    this.state = {
      width: props.multiPanel ? 1000 : 400,
    };
  }
  componentDidMount() {
    this.setState({width: $(ReactDOM.findDOMNode(this)).width()});
  }
  componentWillReceiveProps(nextProps) {

  }
  changeSort(sort) {
    this.props.setSheetTagSort(sort);
    //Sefaria.sheets.tagList(this.loadTags, event.target.value);
  }
  render() {
    var enTitle = this.props.tag || "Source Sheets";
    var heTitle = this.props.tag || "דפי מקורות";

    if (this.props.tag == "My Sheets") {
      var content = (<MySheetsPage
                        hideNavHeader={this.props.hideNavHeader}
                        tagSort={this.props.tagSort}
                        mySheetSort={this.props.mySheetSort}
                        multiPanel={this.props.multiPanel}
                        setMySheetSort={this.props.setMySheetSort}
                        setSheetTag={this.props.setSheetTag}
                        setSheetTagSort={this.props.setSheetTagSort}
                        width={this.state.width} />);


    } else if (this.props.tag == "All Sheets") {
      var content = (<AllSheetsPage
                        hideNavHeader={this.props.hideNavHeader} />);

    } else if (this.props.tag == "sefaria-groups") {
      var content = (<GroupPage
                        hideNavHeader={this.props.hideNavHeader}
                        multiPanel={this.props.multiPanel}
                        group={this.props.group}
                        width={this.state.width} />);

    } else if (this.props.tag) {
      var content = (<TagSheetsPage
                        tag={this.props.tag}
                        setSheetTag={this.props.setSheetTag}
                        multiPanel={this.props.multiPanel}
                        hideNavHeader={this.props.hideNavHeader}
                        width={this.state.width} />);

    } else {
      var content = (<SheetsHomePage
                       tagSort={this.props.tagSort}
                       setSheetTag={this.props.setSheetTag}
                       setSheetTagSort={this.props.setSheetTagSort}
                       multiPanel={this.props.multiPanel}
                       hideNavHeader={this.props.hideNavHeader}
                       width={this.state.width} />);
    }

    var classes = classNames({readerNavMenu: 1, readerSheetsNav: 1, noHeader: this.props.hideNavHeader});
    return (<div className={classes}>
              <CategoryColorLine category="Sheets" />
              {this.props.hideNavHeader ? null :
                 (<div className="readerNavTop searchOnly" key="navTop">
                    <CategoryColorLine category="Sheets" />
                    <ReaderNavigationMenuMenuButton onClick={this.props.openNav} />
                    <div className="readerOptions"></div>
                    <h2>
                      <span className="int-en">{enTitle}</span>
                      <span className="int-he">{heTitle}</span>
                    </h2>
                  </div>)}
              {content}
            </div>);
  }
}

SheetsNav.propTypes = {
  multiPanel:      PropTypes.bool,
  tag:             PropTypes.string,
  tagSort:         PropTypes.string,
  close:           PropTypes.func.isRequired,
  openNav:         PropTypes.func.isRequired,
  setSheetTag:     PropTypes.func.isRequired,
  setSheetTagSort: PropTypes.func.isRequired,
  hideNavHeader:   PropTypes.bool
};


class SheetsHomePage extends Component {
  // A set of options grouped together.
  componentDidMount() {
    this.ensureData();
  }
  getTopSheetsFromCache() {
    return Sefaria.sheets.topSheets();
  }
  getSheetsFromAPI() {
     Sefaria.sheets.topSheets(this.onDataLoad);
  }
  getTagListFromCache() {
    return Sefaria.sheets.tagList(this.props.tagSort);
  }
  getTagListFromAPI() {
    Sefaria.sheets.tagList(this.props.tagSort, this.onDataLoad);
  }
  getTrendingTagsFromCache() {
    return Sefaria.sheets.trendingTags();
  }
  getTrendingTagsFromAPI() {
    Sefaria.sheets.trendingTags(this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  ensureData() {
    if (!this.getTopSheetsFromCache()) { this.getSheetsFromAPI(); }
    if (!this.getTagListFromCache()) { this.getTagListFromAPI(); }
    if (!this.getTrendingTagsFromCache()) { this.getTrendingTagsFromAPI(); }
  }
  showYourSheets() {
    this.props.setSheetTag("My Sheets");
  }
  showAllSheets() {
    this.props.setSheetTag("All Sheets");
  }
  changeSort(sort) {
    this.props.setSheetTagSort(sort);
  }
  _type_sheet_button(en, he, on_click, active) {
    var classes = classNames({"type-button": 1, active: active});

    return <div className={classes} onClick={on_click}>
              <div className="type-button-title">
                <span className="int-en">{en}</span>
                <span className="int-he">{he}</span>
              </div>
            </div>;
  }
  render() {
    var trendingTags = this.getTrendingTagsFromCache();
    var topSheets    = this.getTopSheetsFromCache();
    if (this.props.tagSort == "trending") { var tagList  = this.getTrendingTagsFromCache(); }
    else { var tagList = this.getTagListFromCache(); }

    var makeTagButton = tag => <SheetTagButton setSheetTag={this.props.setSheetTag} tag={tag.tag} count={tag.count} key={tag.tag} />;

    var trendingTags    = trendingTags ? trendingTags.slice(0,6).map(makeTagButton) : [<LoadingMessage />];
    var tagList         = tagList ? tagList.map(makeTagButton) : [<LoadingMessage />];
    var publicSheetList = topSheets ? topSheets.map(function(sheet) {
      return (<PublicSheetListing sheet={sheet} key={sheet.id} />);
    }) : <LoadingMessage />;

    var yourSheetsButton  = Sefaria._uid ?
      (<div className="yourSheetsLink navButton" onClick={this.showYourSheets}>
        <span className="int-en">My Source Sheets <i className="fa fa-chevron-right"></i></span>
        <span className="int-he">דפי המקורות שלי <i className="fa fa-chevron-left"></i></span>
       </div>) : null;

    return (<div className="content hasFooter">
              <div className="contentInner">
                {this.props.hideNavHeader ? (<h1>
                  <span className="int-en">Source Sheets</span>
                  <span className="int-he">דפי מקורות</span>
                </h1>) : null}
                { this.props.multiPanel ? null : yourSheetsButton }

                { this.props.multiPanel ?
                  (<h2 className="splitHeader">
                    <span className="int-en">Public Sheets</span>
                    <span className="int-en actionText" onClick={this.showAllSheets}>See All <i className="fa fa-angle-right"></i></span>
                    <span className="int-he">דפי מקורות פומביים</span>
                    <span className="int-he actionText" onClick={this.showAllSheets}>צפה בהכל <i className="fa fa-angle-left"></i></span>
                  </h2>) :
                  (<h2>
                      <span className="int-en">Public Sheets</span>
                      <span className="int-he">דפי מקורות פומביים</span>
                   </h2>)}

                <div className="topSheetsBox">
                  {publicSheetList}
                </div>

                { this.props.multiPanel ? null :
                  (<h2>
                     <span className="int-en">Trending Tags</span>
                    <span className="int-he">תוויות פופולריות</span>
                   </h2>)}

                { this.props.multiPanel ? null : (<TwoOrThreeBox content={trendingTags} width={this.props.width} /> )}

                { this.props.multiPanel ? (
                    <h2 className="tagsHeader">
                      <span className="int-en">All Tags</span>
                      <span className="int-he">כל התוויות</span>
                      <div className="actionText">
                        <div className="type-buttons">
                          {this._type_sheet_button("Most Used", "הכי בשימוש", () => this.changeSort("count"), (this.props.tagSort == "count"))}
                          {this._type_sheet_button("Alphabetical", "אלפביתי", () => this.changeSort("alpha"), (this.props.tagSort == "alpha"))}
                          {this._type_sheet_button("Trending", "פופולרי", () => this.changeSort("trending"), (this.props.tagSort == "trending"))}
                        </div>
                      </div>
                    </h2>
                ) : (
                <h2>
                  <span className="en">All Tags</span>
                  <span className="he">כל התוויות</span>
                </h2>
                )}

                <TwoOrThreeBox content={tagList} width={this.props.width} />
              </div>
              <footer id="footer" className="static sans">
                    <Footer />
              </footer>
             </div>);
  }
}

SheetsHomePage.propTypes = {
  setSheetTag:     PropTypes.func.isRequired,
  setSheetTagSort: PropTypes.func.isRequired,
  hideNavHeader:   PropTypes.bool
};

class TagSheetsPage extends Component {
  // Page list all public sheets.
  componentDidMount() {
    this.ensureData();
  }
  getSheetsFromCache() {
    return  Sefaria.sheets.sheetsByTag(this.props.tag);
  }
  getSheetsFromAPI() {
     Sefaria.sheets.sheetsByTag(this.props.tag, this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  ensureData() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
  }
  render() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets ? sheets.map(function (sheet) {
      return (<PublicSheetListing sheet={sheet} key={sheet.id} />);
    }) : (<LoadingMessage />);
    return (<div className="content sheetList hasFooter">
                      <div className="contentInner">
                        {this.props.hideNavHeader ? (<h1>
                          <span className="int-en">{this.props.tag}</span>
                          <span className="int-he">{this.props.tag}</span>
                        </h1>) : null}
                        {sheets}
                      </div>
                      <footer id="footer" className="static sans">
                        <Footer />
                      </footer>
                    </div>);
  }
}

TagSheetsPage.propTypes = {
  hideNavHeader:   PropTypes.bool
};

class AllSheetsPage extends Component {
  // Page list all public sheets.
  // TODO this is currently loading all public sheets at once, needs pagination
  constructor(props) {
    super(props);

    this.state = {
      page: 1,
      loadedToEnd: false,
      loading: false,
      curSheets: [],
    };
  }
  componentDidMount() {
    $(ReactDOM.findDOMNode(this)).bind("scroll", this.handleScroll);
    this.ensureData();
  }
  handleScroll() {
    if (this.state.loadedToEnd || this.state.loading) { return; }
    var $scrollable = $(ReactDOM.findDOMNode(this));
    var margin = 100;
    if($scrollable.scrollTop() + $scrollable.innerHeight() + margin >= $scrollable[0].scrollHeight) {
      this.getMoreSheets();
    }
  }
  getMoreSheets() {
    if (this.state.page == 1) {
      Sefaria.sheets.publicSheets(0,100,this.loadMoreSheets);
    }
    else {
      Sefaria.sheets.publicSheets( ((this.state.page)*50),50,this.loadMoreSheets);
    }
    this.setState({loading: true});
  }
  loadMoreSheets(data) {
    this.setState({page: this.state.page + 1});
    this.createSheetList(data)
  }
  createSheetList(newSheets) {

      if (newSheets) {
        this.setState({curSheets: this.state.curSheets.concat(newSheets), loading: false});
      }
  }
  getSheetsFromCache(offset) {
    if (!offset) offset=0;
    return  Sefaria.sheets.publicSheets(offset,50);
  }
  getSheetsFromAPI(offset) {
    if (!offset) offset=0;
     Sefaria.sheets.publicSheets(offset,50, this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  ensureData() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
  }
  render() {
    if (this.state.page == 1) {
      var sheets = this.getSheetsFromCache();
    }
    else {
      var sheets = this.state.curSheets;
    }
    sheets = sheets ? sheets.map(function (sheet) {
      return (<PublicSheetListing sheet={sheet} />);
    }) : (<LoadingMessage />);
    return (<div className="content sheetList hasFooter">
                      <div className="contentInner">
                        {this.props.hideNavHeader ? (<h1>
                          <span className="int-en">All Sheets</span>
                          <span className="int-he">כל דפי המקורות</span>
                        </h1>) : null}
                        {sheets}
                      </div>
                      <footer id="footer" className="static sans">
                        <Footer />
                      </footer>
                    </div>);
  }
}

AllSheetsPage.propTypes = {
  hideNavHeader:   PropTypes.bool
};

class PublicSheetListing extends Component {
  render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;
    return (<a className="sheet" href={url} key={url}>
              {sheet.ownerImageUrl ? (<img className="sheetImg" src={sheet.ownerImageUrl} alt={sheet.ownerName}/>) : null}
              <span className="sheetViews"><i className="fa fa-eye"></i> {sheet.views}</span>
              <div className="sheetAuthor">{sheet.ownerName}</div>
              <div className="sheetTitle">{title}</div>
            </a>);
  }
}

PublicSheetListing.propTypes = {
  sheet: PropTypes.object.isRequired
};


class SheetTagButton extends Component {
  handleTagClick(e) {
    e.preventDefault();
    this.props.setSheetTag(this.props.tag);
  }
  render() {
    return (<a href={`/sheets/tags/${this.props.tag}`} className="navButton" onClick={this.handleTagClick}>{this.props.tag} (<span className="enInHe">{this.props.count}</span>)</a>);
  }
}

SheetTagButton.propTypes = {
  tag:   PropTypes.string.isRequired,
  count: PropTypes.number.isRequired,
  setSheetTag: PropTypes.func.isRequired
};


class MySheetsPage extends Component {
  constructor(props) {
    super(props);

    this.state = {
      showYourSheetTags: false,
      sheetFilterTag: null
    };
  }
  componentDidMount() {
    this.ensureData();
  }
  getSheetsFromCache() {
    return  Sefaria.sheets.userSheets(Sefaria._uid, null, this.props.mySheetSort);
  }
  getSheetsFromAPI() {
     Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, this.props.mySheetSort);
  }
  getTagsFromCache() {
    return Sefaria.sheets.userTagList(Sefaria._uid)
  }
  getTagsFromAPI() {
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad);
  }
  onDataLoad(data) {
    this.forceUpdate();
  }
  ensureData() {
    if (!this.getSheetsFromCache()) { this.getSheetsFromAPI(); }
    if (!this.getTagsFromCache())   { this.getTagsFromAPI(); }
  }
  toggleSheetTags() {
    this.state.showYourSheetTags ? this.setState({showYourSheetTags: false}) : this.setState({showYourSheetTags: true});
  }
  filterYourSheetsByTag (tag) {
    if (tag.tag == this.state.sheetFilterTag) {
       this.setState({sheetFilterTag: null, showYourSheetTags: false});
    } else {
      this.setState({sheetFilterTag: tag.tag, showYourSheetTags: false});
    }
  }
  changeSortYourSheets(event) {
    this.props.setMySheetSort(event.target.value);
    Sefaria.sheets.userSheets(Sefaria._uid, this.onDataLoad, event.target.value);
  }
  render() {
    var sheets = this.getSheetsFromCache();
    sheets = sheets && this.state.sheetFilterTag ? sheets.filter(function(sheet) {
      return Sefaria.util.inArray(this.state.sheetFilterTag, sheet.tags) >= 0;
    }.bind(this)) : sheets;
    sheets = sheets ? sheets.map(function(sheet) {
      return (<PrivateSheetListing sheet={sheet} setSheetTag={this.props.setSheetTag} key={sheet.id} />);
    }.bind(this)) : (<LoadingMessage />);

    var userTagList = this.getTagsFromCache();
    userTagList = userTagList ? userTagList.map(function (tag) {
      var filterThisTag = this.filterYourSheetsByTag.bind(this, tag);
      var classes = classNames({navButton: 1, sheetButton: 1, active: this.state.sheetFilterTag == tag.tag});
      return (<div className={classes} onClick={filterThisTag} key={tag.tag}>{tag.tag} ({tag.count})</div>);
    }.bind(this)) : null;

    return (<div className="content sheetList">
              <div className="contentInner">
                {this.props.hideNavHeader ?
                  (<h1>
                    <span className="int-en">My Source Sheets</span>
                    <span className="int-he">דפי המקורות שלי</span>
                  </h1>) : null}
                {this.props.hideNavHeader ?
                  (<div className="sheetsNewButton">
                    <a className="button white" href="/sheets/new">
                        <span className="int-en">Create a Source Sheet</span>
                        <span className="int-he">צור דף מקורות חדש</span>
                    </a>
                  </div>) : null }

                {this.props.hideNavHeader ?
                 (<h2 className="splitHeader">
                    <span className="int-en" onClick={this.toggleSheetTags}>Filter By Tag <i className="fa fa-angle-down"></i></span>
                    <span className="int-he" onClick={this.toggleSheetTags}>סנן לפי תווית<i className="fa fa-angle-down"></i></span>
                    <span className="int-en actionText">Sort By:
                      <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                       <option value="date">Recent</option>
                       <option value="views">Most Viewed</option>
                     </select> <i className="fa fa-angle-down"></i></span>
                    <span className="int-he actionText">סנן לפי:
                      <select value={this.props.mySheetSort} onChange={this.changeSortYourSheets}>
                       <option value="date">הכי חדש</option>
                       <option value="views">הכי נצפה</option>
                     </select> <i className="fa fa-angle-down"></i></span>

                  </h2>) : null }
                {this.state.showYourSheetTags ? <TwoOrThreeBox content={userTagList} width={this.props.width} /> : null}
                {sheets}
              </div>
            </div>);
  }
}

MySheetsPage.propTypes = {
  setSheetTag:     PropTypes.func.isRequired,
  setSheetTagSort: PropTypes.func.isRequired,
  multiPanel:      PropTypes.bool,
  hideNavHeader:   PropTypes.bool

};


class PrivateSheetListing extends Component {
  render() {
    var sheet = this.props.sheet;
    var title = sheet.title ? sheet.title.stripHtml() : "Untitled Source Sheet";
    var url = "/sheets/" + sheet.id;

    if (sheet.tags === undefined) sheet.tags = [];
      var tagString = sheet.tags.map(function (tag) {
          return(<SheetTagLink setSheetTag={this.props.setSheetTag} tag={tag} key={tag} />);
    }, this);

   return (<div className="sheet userSheet" href={url} key={url}>
              <a className="sheetTitle" href={url}>{title}</a>  <SheetAccessIcon sheet={sheet} />
              <div>{sheet.views} Views · {sheet.modified} · <span className="tagString">{tagString}</span></div>
          </div>);
  }
}

PrivateSheetListing.propTypes = {
  sheet:       PropTypes.object.isRequired,
  setSheetTag: PropTypes.func.isRequired
};

module.exports = SheetsNav;
