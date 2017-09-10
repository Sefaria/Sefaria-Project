const {
  CategoryColorLine,
  ReaderNavigationMenuCloseButton,
  ReaderNavigationMenuSearchButton,
  ReaderNavigationMenuDisplaySettingsButton,
  ReaderNavigationMenuSection,
  TextBlockLink,
  TwoOrThreeBox,
  TwoBox,
  LanguageToggleButton,
}                                  = require('./Misc');
const React                        = require('react');
const ReactDOM                     = require('react-dom');
const PropTypes                    = require('prop-types');
const classNames                   = require('classnames');
const Sefaria                      = require('./sefaria/sefaria');
const $                            = require('./sefaria/sefariaJquery');
const ReaderNavigationCategoryMenu = require('./ReaderNavigationCategoryMenu');
const Footer                       = require('./Footer');
import Component from 'react-class';


class ReaderNavigationMenu extends Component {
  // The Navigation menu for browsing and searching texts, plus some site links.
  constructor(props) {
    super(props);

    this.width = 1000;
    this.state = {
      showMore: false
    };
  }
  componentDidMount() {
    this.setWidth();
    window.addEventListener("resize", this.setWidth);
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.setWidth);
  }
  setWidth() {
    var width = $(ReactDOM.findDOMNode(this)).width();
    // console.log("Setting RNM width: " + width);
    var winWidth = $(window).width();
    var winHeight = $(window).height();
    // console.log("Window width: " + winWidth + ", Window height: " + winHeight);
    var oldWidth = this.width;
    this.width = width;
    if ((oldWidth <= 500 && width > 500) ||
        (oldWidth > 500 && width <= 500)) {
      this.forceUpdate();
    }
  }
  navHome() {
    this.props.setCategories([]);
    this.props.openNav();
  }
  closeNav() {
    if (this.props.compare) {
      this.props.closePanel();
    } else {
      this.props.setCategories([]);
      this.props.closeNav();
    }
  }
  showMore(event) {
    event.preventDefault();
    this.setState({showMore: true});
  }
  handleClick(event) {
    if (!$(event.target).hasClass("outOfAppLink") && !$(event.target.parentElement).hasClass("outOfAppLink")) {
      event.preventDefault();
    }
    if ($(event.target).hasClass("refLink") || $(event.target).parent().hasClass("refLink")) {
      var ref = $(event.target).attr("data-ref") || $(event.target).parent().attr("data-ref");
      var pos = $(event.target).attr("data-position") || $(event.target).parent().attr("data-position");
      var version = $(event.target).attr("data-version") || $(event.target).parent().attr("data-version");
      var versionLanguage = $(event.target).attr("data-versionlanguage") || $(event.target).parent().attr("data-versionlanguage");
      if ($(event.target).hasClass("recentItem") || $(event.target).parent().hasClass("recentItem")) {
        this.props.onRecentClick(parseInt(pos), ref, version, versionLanguage);
      } else {
        this.props.onTextClick(ref, version, versionLanguage);
      }
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Text Click", ref); }
    } else if ($(event.target).hasClass("catLink") || $(event.target).parent().hasClass("catLink")) {
      var cats = $(event.target).attr("data-cats") || $(event.target).parent().attr("data-cats");
      cats = cats.split("|");
      this.props.setCategories(cats);
      if (Sefaria.site) { Sefaria.track.event("Reader", "Navigation Sub Category Click", cats.join(" / ")); }
    }
  }
  handleSearchKeyUp(event) {
    if (event.keyCode === 13) {
      var query = $(event.target).val();
      this.props.openSearch(query);
    }
  }
  handleSearchButtonClick(event) {
    var query = $(ReactDOM.findDOMNode(this)).find(".readerSearch").val();
    if (query) {
      this.props.openSearch(query);
    }
  }
  render() {
    if (this.props.categories.length && this.props.categories[0] == "recent") {
      return (<div onClick={this.handleClick}>
                <RecentPanel
                  multiPanel={this.props.multiPanel}
                  closeNav={this.closeNav}
                  openDisplaySettings={this.props.openDisplaySettings}
                  toggleLanguage={this.props.toggleLanguage}
                  navHome={this.navHome}
                  compare={this.props.compare}
                  hideNavHeader={this.props.hideNavHeader}
                  width={this.width}
                  interfaceLang={this.props.interfaceLang} />
              </div>);
    } else if (this.props.categories.length) {
      // List of Texts in a Category
      return (<div className="readerNavMenu" onClick={this.handleClick} >
                <ReaderNavigationCategoryMenu
                  categories={this.props.categories}
                  category={this.props.categories.slice(-1)[0]}
                  closeNav={this.closeNav}
                  setCategories={this.props.setCategories}
                  toggleLanguage={this.props.toggleLanguage}
                  openDisplaySettings={this.props.openDisplaySettings}
                  navHome={this.navHome}
                  compare={this.props.compare}
                  hideNavHeader={this.props.hideNavHeader}
                  width={this.width}
                  interfaceLang={this.props.interfaceLang} />
              </div>);
    } else {
      // Root Library Menu
      var categories = Sefaria.toc.map(function(cat) {
        var style = {"borderColor": Sefaria.palette.categoryColor(cat.category)};
        var openCat = function(e) {e.preventDefault(); this.props.setCategories([cat.category])}.bind(this);
        return (<a href={`/texts/${cat.category}`} className="readerNavCategory" data-cat={cat.category} style={style} onClick={openCat}>
                    <span className="en">{cat.category}</span>
                    <span className="he">{cat.heCategory}</span>
                  </a>
                );
      }.bind(this));
      var more = (<a href="#" className="readerNavCategory readerNavMore" style={{"borderColor": Sefaria.palette.colors.darkblue}} onClick={this.showMore}>
                      <span className="en">More <img src="/static/img/arrow-right.png" alt="" /></span>
                      <span className="he">עוד <img src="/static/img/arrow-left.png" alt="" /></span>
                  </a>);
      var nCats  = this.width < 500 ? 9 : 8;
      categories = this.state.showMore ? categories : categories.slice(0, nCats).concat(more);
      categories = (<div className="readerNavCategories"><TwoOrThreeBox content={categories} width={this.width} /></div>);


      var siteLinks = Sefaria._uid ?
                    [(<a className="siteLink outOfAppLink" key='profile' href="/my/profile">
                        <i className="fa fa-user"></i>
                        <span className="en">Your Profile</span>
                        <span className="he">הפרופיל שלי</span>
                      </a>),
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink outOfAppLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספריא</span>
                      </a>),
                     (<span className='divider' key="d2">•</span>),
                     (<a className="siteLink outOfAppLink" key='logout' href="/logout">
                        <span className="en">Logout</span>
                        <span className="he">התנתק</span>
                      </a>)] :

                    [(<a className="siteLink outOfAppLink" key='about' href="/about">
                        <span className="en">About Sefaria</span>
                        <span className="he">אודות ספריא</span>
                      </a>),
                     (<span className='divider' key="d1">•</span>),
                     (<a className="siteLink outOfAppLink" key='login' href="/login">
                        <span className="en">Sign In</span>
                        <span className="he">התחבר</span>
                      </a>)];
      siteLinks = (<div className="siteLinks">
                    {siteLinks}
                  </div>);

      var calendar = Sefaria.calendar ?
                     [(<TextBlockLink sref={Sefaria.calendar.parasha} title={Sefaria.calendar.parashaName} heTitle={Sefaria.calendar.heParashaName} category="Tanakh" />),
                      (<TextBlockLink sref={Sefaria.calendar.haftara} title="Haftara" heTitle="הפטרה" category="Tanakh" />),
                      (<TextBlockLink sref={Sefaria.calendar.daf_yomi} title="Daf Yomi" heTitle="דף יומי" category="Talmud" />)] : [];
      calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={this.width} /></div>);


      var sheetsStyle = {"borderColor": Sefaria.palette.categoryColor("Sheets")};
      var resources = [(<a className="resourcesLink" style={sheetsStyle} href="/sheets" onClick={this.props.openMenu.bind(null, "sheets")}>
                        <img src="/static/img/sheet-icon.png" alt="" />
                        <span className="int-en">Source Sheets</span>
                        <span className="int-he">דפי מקורות</span>
                      </a>),
                     (<a className="resourcesLink outOfAppLink" style={sheetsStyle} href="/visualizations">
                        <img src="/static/img/visualizations-icon.png" alt="" />
                        <span className="int-en">Visualizations</span>
                        <span className="int-he">חזותיים</span>
                      </a>),
                    (<a className="resourcesLink outOfAppLink" style={sheetsStyle} href="/people">
                        <img src="/static/img/authors-icon.png" alt="" />
                        <span className="int-en">Authors</span>
                        <span className="int-he">רשימת מחברים</span>
                      </a>),
                    (<a className="resourcesLink" style={sheetsStyle} href="/topics" onClick={this.props.openMenu.bind(null, "topics")}>
                        <img src="/static/img/hashtag-icon.svg" alt="" />
                        <span className="int-en">Topics</span>
                        <span className="int-he">נושאים</span>
                      </a>)
                      ];
      resources = (<div className="readerNavCalendar"><TwoBox content={resources} width={this.width} /></div>);


      var topContent = this.props.home ?
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuSearchButton onClick={this.navHome} />
                <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                <div className='sefariaLogo'><img src="/static/img/sefaria.svg" alt="Sefaria Logo" /></div>
              </div>) :
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuCloseButton onClick={this.closeNav} icon={this.props.compare ? "circledX" : null} />
                <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                <input id="searchInput" className="readerSearch" title="Search for Texts or Keywords Here" placeholder="Search" onKeyUp={this.handleSearchKeyUp} />
              </div>);
      topContent = this.props.hideNavHeader ? null : topContent;


      var nRecent = this.width < 500 ? 4 : 6;
      var recentlyViewed = Sefaria.recentlyViewed;
      var hasMore = recentlyViewed.length > nRecent;
      recentlyViewed = recentlyViewed.slice(0, hasMore ? nRecent-1 : nRecent)
        .map(function(item) {
          return (<TextBlockLink
                    sref={item.ref}
                    heRef={item.heRef}
                    book={item.book}
                    version={item.version}
                    versionLanguage={item.versionLanguage}
                    showSections={true}
                    recentItem={true} />)
          });
      if (hasMore) {
        recentlyViewed.push(
          <a href="/texts/recent" className="readerNavCategory readerNavMore" style={{"borderColor": Sefaria.palette.colors.darkblue}} onClick={this.props.setCategories.bind(null, ["recent"])}>
            <span className="en">More <img src="/static/img/arrow-right.png" alt="" /></span>
            <span className="he">עוד <img src="/static/img/arrow-left.png" alt=""  /></span>
          </a>);
      }
      recentlyViewed = recentlyViewed.length ? <TwoOrThreeBox content={recentlyViewed} width={this.width} /> : null;

      var title = (<h1>
                    { this.props.multiPanel ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                    <span className="int-en">The Sefaria Library</span>
                    <span className="int-he">האוסף של ספריא</span>
                  </h1>);

      var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );
      var classes = classNames({readerNavMenu:1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home });
      var contentClasses = classNames({content: 1, hasFooter: footer != null});
      return(<div className={classes} onClick={this.handleClick} key="0">
              {topContent}
              <div className={contentClasses}>
                <div className="contentInner">
                  { this.props.compare ? null : title }
                  <ReaderNavigationMenuSection title="Recent" heTitle="נצפו לאחרונה" content={recentlyViewed} />
                  <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categories} />
                  <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} />
                  { this.props.compare ? null : (<ReaderNavigationMenuSection title="Resources" heTitle="קהילה" content={resources} />) }
                  { this.props.multiPanel ? null : siteLinks }
                </div>
                {footer}
              </div>
            </div>);
    }
  }
}
ReaderNavigationMenu.propTypes = {
  categories:    PropTypes.array.isRequired,
  settings:      PropTypes.object.isRequired,
  setCategories: PropTypes.func.isRequired,
  setOption:     PropTypes.func.isRequired,
  closeNav:      PropTypes.func.isRequired,
  openNav:       PropTypes.func.isRequired,
  openSearch:    PropTypes.func.isRequired,
  openMenu:      PropTypes.func.isRequired,
  onTextClick:   PropTypes.func.isRequired,
  onRecentClick: PropTypes.func.isRequired,
  closePanel:    PropTypes.func,
  hideNavHeader: PropTypes.bool,
  multiPanel:    PropTypes.bool,
  home:          PropTypes.bool,
  compare:       PropTypes.bool
};


class RecentPanel extends Component {
  render() {
    var width = typeof window !== "undefined" ? $(window).width() : 1000;

    var recentItems = Sefaria.recentlyViewed.map(function(item) {
      return (<TextBlockLink
                sref={item.ref}
                heRef={item.heRef}
                book={item.book}
                version={item.version}
                versionLanguage={item.versionLanguage}
                showSections={true}
                recentItem={true} />)
    });
    var recentContent = (<TwoOrThreeBox content={recentItems} width={width} />);

    var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );


    var navMenuClasses = classNames({recentPanel: 1, readerNavMenu: 1, noHeader: this.props.hideNavHeader, compare:this.props.compare});
    var navTopClasses  = classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: this.props.hideNavHeader});
    var contentClasses = classNames({content: 1, hasFooter: footer != null});
    return (
      <div className={navMenuClasses}>
        {this.props.hideNavHeader ? null :
          <div className={navTopClasses}>
            <CategoryColorLine category={"Other"} />
            <ReaderNavigationMenuMenuButton onClick={this.props.navHome} compare={this.props.compare} />
            <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
            <h2>
              <span className="int-en">Recent</span>
              <span className="int-he">נצפו לאחרונה</span>
            </h2>
        </div>}
        <div className={contentClasses}>
          <div className="contentInner">
            {this.props.hideNavHeader ?
              <h1>
              { this.props.multiPanel ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
              <span className="int-en">Recent</span>
              <span className="int-he">נצפו לאחרונה</span>
            </h1>
            : null }
            {recentContent}
          </div>
          {footer}
        </div>
      </div>
      );
  }
}
RecentPanel.propTypes = {
  closeNav:            PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  navHome:             PropTypes.func.isRequired,
  width:               PropTypes.number,
  compare:             PropTypes.bool,
  hideNavHeader:       PropTypes.bool,
  interfaceLang:       PropTypes.string
};


module.exports = ReaderNavigationMenu;
