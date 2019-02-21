const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
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
  showMore(event) {
    event.preventDefault();
    this.setState({showMore: true});
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
  openSaved() {
    if (Sefaria._uid) {
      this.props.openMenu("saved");
    } else {
      this.props.toggleSignUpModal();
    }
  }
  render() {
    if (this.props.categories.length) {
      // List of Texts in a Category
      return (<div className="readerNavMenu" onClick={this.props.handleClick} >
                <ReaderNavigationCategoryMenu
                  categories={this.props.categories}
                  category={this.props.categories.slice(-1)[0]}
                  closeNav={this.onClose}
                  setCategories={this.props.setCategories}
                  toggleLanguage={this.props.toggleLanguage}
                  openDisplaySettings={this.props.openDisplaySettings}
                  navHome={this.navHome}
                  compare={this.props.compare}
                  hideNavHeader={this.props.hideNavHeader}
                  width={this.width}
                  contentLang={this.props.settings.language}
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
      var calendar = Sefaria.calendars.map(function(item) {
          return (<TextBlockLink
                    sref={item.ref}
                    url_string={item.url}
                    title={item.title["en"]}
                    heTitle={item.title["he"]}
                    displayValue={item.displayValue["en"]}
                    heDisplayValue={item.displayValue["he"]}
                    category={item.category}
                    showSections={false}
                    recentItem={false} />)
      });
      calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={this.width} /></div>);

      var resources = [(<a className="resourcesLink" href="/sheets" onClick={this.props.openMenu.bind(null, "sheets")}>
                        <img src="/static/img/sheet-icon.png" alt="source sheets icon" />
                        <span className="int-en">Source Sheets</span>
                        <span className="int-he">דפי מקורות</span>
                      </a>),
                     (<a className="resourcesLink outOfAppLink" href="/visualizations">
                        <img src="/static/img/visualizations-icon.png" alt="visualization icon" />
                        <span className="int-en">Visualizations</span>
                        <span className="int-he">תרשימים גרפיים</span>
                      </a>),
                    (<a className="resourcesLink outOfAppLink" href="/people">
                        <img src="/static/img/authors-icon.png" alt="author icon" />
                        <span className="int-en">Authors</span>
                        <span className="int-he">רשימת מחברים</span>
                      </a>),
                    (<a className="resourcesLink" href="/topics" onClick={this.props.openMenu.bind(null, "topics")}>
                        <img src="/static/img/hashtag-icon.svg" alt="resources icon" />
                        <span className="int-en">Topics</span>
                        <span className="int-he">נושאים</span>
                      </a>),
                    (<a className="resourcesLink outOfAppLink" href="/groups">
                        <img src="/static/img/group.svg" alt="Groups icon" />
                        <span className="int-en">Groups</span>
                        <span className="int-he">קבוצות</span>
                      </a>)
                      ];
      resources = (<div className="readerTocResources"><TwoBox content={resources} width={this.width} /></div>);


      var topContent = this.props.home ?
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <ReaderNavigationMenuSearchButton onClick={this.navHome} />
                <div className='sefariaLogo'><img src="/static/img/logo.svg" alt="Sefaria Logo" /></div>
                {this.props.interfaceLang !== "hebrew" ?
                  <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} />
                  : <ReaderNavigationMenuDisplaySettingsButton placeholder={true} /> }
              </div>) :
              (<div className="readerNavTop search">
                <CategoryColorLine category="Other" />
                <div className="readerNavTopStart">
                  <ReaderNavigationMenuMenuButton onClick={this.onClose} compare={this.props.compare} interfaceLang={this.props.interfaceLang}/>
                  <div className="searchBox">
                    <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                    <input id="searchInput" className="readerSearch" title={Sefaria._("Search for Texts or Keywords Here")} placeholder={Sefaria._("Search")} onKeyUp={this.handleSearchKeyUp} />
                  </div>
                </div>
                {this.props.interfaceLang !== "hebrew" ? <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} /> : null}

              </div>);
      topContent = this.props.hideNavHeader ? null : topContent;

      let topUserData = [
        <a href="/texts/saved" className="resourcesLink" onClick={this.openSaved}>
          <img src="/static/img/star.png" alt="saved text icon" />
          <span className="en">Saved</span>
          <span className="he">שמורים</span>
        </a>,
        <a href="/texts/history" className="resourcesLink" onClick={this.props.openMenu.bind(null, "history")}>
          <img src="/static/img/clock.png" alt="" />
          <span className="en">History</span>
          <span className="he">היסטוריה</span>
        </a>
      ];
      topUserData = (<div className="readerTocResources userDataButtons"><TwoBox content={topUserData} width={this.width} /></div>);


      var title = (<h1>
                    { this.props.multiPanel && this.props.interfaceLang !== "hebrew" ? <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                    <span className="int-en">The Sefaria Library</span>
                    <span className="int-he">האוסף של ספריא</span>
                  </h1>);

      var footer = this.props.compare ? null :
                    (<footer id="footer" className={`interface-${this.props.interfaceLang} static sans`}>
                      <Footer />
                    </footer> );
      var classes = classNames({readerNavMenu:1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home, noLangToggleInHebrew: 1 });
      var contentClasses = classNames({content: 1, hasFooter: footer != null});
      return(<div className={classes} onClick={this.props.handleClick} key="0">
              {topContent}
              <div className={contentClasses}>
                <div className="contentInner">
                  { this.props.compare ? null : title }
                  { topUserData }
                  <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categories} />
                  <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} enableAnchor={true} />
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
  onClose:       PropTypes.func.isRequired,
  openNav:       PropTypes.func.isRequired,
  openSearch:    PropTypes.func.isRequired,
  openMenu:      PropTypes.func.isRequired,
  onTextClick:   PropTypes.func.isRequired,
  onRecentClick: PropTypes.func.isRequired,
  handleClick:   PropTypes.func.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  closePanel:    PropTypes.func,
  hideNavHeader: PropTypes.bool,
  multiPanel:    PropTypes.bool,
  home:          PropTypes.bool,
  compare:       PropTypes.bool,
  interfaceLang: PropTypes.string,
};

module.exports = ReaderNavigationMenu;
