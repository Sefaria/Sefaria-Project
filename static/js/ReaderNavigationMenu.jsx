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
//const React                        = require('react');
import React, { useState, useEffect } from 'react';
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
      showMore: Sefaria.toc.length < 9,
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
                  closeNav={this.props.onClose}
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
      let categories = Sefaria.toc.map(cat => {
        const style = {"borderColor": Sefaria.palette.categoryColor(cat.category)};
        const openCat = e => {e.preventDefault(); this.props.setCategories([cat.category])};
        return (<a href={`/texts/${cat.category}`} className="readerNavCategory" data-cat={cat.category} style={style} onClick={openCat}>
                    <span className="en">{cat.category}</span>
                    <span className="he">{cat.heCategory}</span>
                  </a>
                );
      });
      const more = (<a href="#" className="readerNavCategory readerNavMore" style={{"borderColor": Sefaria.palette.colors.darkblue}} onClick={this.showMore}>
                      <span className="en">More <img src="/static/img/arrow-right.png" alt="" /></span>
                      <span className="he">עוד <img src="/static/img/arrow-left.png" alt="" /></span>
                  </a>);
      const nCats  = this.width < 500 ? 9 : 8;
      categories = this.state.showMore ? categories : categories.slice(0, nCats).concat(more);
      categories = (<div className="readerNavCategories"><TwoOrThreeBox content={categories} width={this.width} /></div>);


      let siteLinks = Sefaria._uid ?
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


      let calendar = Sefaria.calendars.map(function(item) {
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


      let resources = [
          <TocLink en="Source Sheets" he="דפי מקורות" href="/sheets" resourcesLink={true} onClick={this.props.openMenu.bind(null, "sheets")}
                img="/static/img/sheet-icon.png"  alt="source sheets icon"/>,
          <TocLink en="Visualizations" he="תרשימים גרפיים" href="/visualizations" resourcesLink={true} outOfAppLink={true}
                img="/static/img/visualizations-icon.png" alt="visualization icon" />,
          <TocLink en="Authors" he="רשימת מחברים" href="/people" resourcesLink={true} outOfAppLink={true}
                img="/static/img/authors-icon.png" alt="author icon"/>,
          <TocLink en="Topics" he="נושאים" href="/topics" resourcesLink={true} onClick={this.props.openMenu.bind(null, "topics")}
                img="/static/img/hashtag-icon.svg" alt="resources icon" />,
          <TocLink en="Groups" he="קבוצות" href="/groups" resourcesLink={true} outOfAppLink={true}
                img="/static/img/group.svg" alt="Groups icon"/>
      ];

      const torahSpecificResources = ["/visualizations", "/people"];
      if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
        resources = resources.filter(r => torahSpecificResources.indexOf(r.props.href) == -1);
      }
      resources = (<div className="readerTocResources"><TwoBox content={resources} width={this.width} /></div>);


      let topContent = this.props.home ?
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
                  <ReaderNavigationMenuMenuButton onClick={this.props.onClose} compare={this.props.compare} interfaceLang={this.props.interfaceLang}/>
                  <div className="searchBox">
                    <ReaderNavigationMenuSearchButton onClick={this.handleSearchButtonClick} />
                    <input id="searchInput" className="readerSearch" title={Sefaria._("Search for Texts or Keywords Here")} placeholder={Sefaria._("Search")} onKeyUp={this.handleSearchKeyUp} />
                  </div>
                </div>
                {this.props.interfaceLang !== "hebrew" ? <ReaderNavigationMenuDisplaySettingsButton onClick={this.props.openDisplaySettings} /> : null}

              </div>);
      topContent = this.props.hideNavHeader ? null : topContent;

      let topUserData = [
          <TocLink en="Saved" he="שמורים" href="/texts/saved" resourcesLink={true} onClick={this.openSaved} img="/static/img/star.png" alt="saved text icon"/>,
          <TocLink en="History" he="היסטוריה" href="/texts/history" resourcesLink={true} onClick={this.props.openMenu.bind(null, "history")} img="/static/img/clock.png" alt="history icon"/>
      ];
      topUserData = (<div className="readerTocResources userDataButtons"><TwoBox content={topUserData} width={this.width} /></div>);

      let donation  = [
          <TocLink en="Make a Donation" he="תרומות" resourcesLink={true} outOfAppLink={true} classes="donationLink" img="/static/img/heart.png" alt="donation icon" href="https://sefaria.nationbuilder.com/supportsefaria"/>,
          <TocLink en="Sponsor a day" he="תנו חסות ליום לימוד" resourcesLink={true} outOfAppLink={true} classes="donationLink" img="/static/img/calendar.svg" alt="donation icon" href="https://sefaria.nationbuilder.com/sponsor"/>,
      ];

      donation = (<div className="readerTocResources"><TwoBox content={donation} width={this.width} /></div>);


      const title = (<h1>
                    { this.props.multiPanel && this.props.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
                     <LanguageToggleButton toggleLanguage={this.props.toggleLanguage} /> : null }
                    <span className="int-en">{Sefaria._siteSettings.LIBRARY_NAME.en}</span>
                    <span className="int-he">{Sefaria._siteSettings.LIBRARY_NAME.he}</span>
                  </h1>);

      const footer = this.props.compare ? null : <Footer />;
      const classes = classNames({readerNavMenu:1, noHeader: !this.props.hideHeader, compare: this.props.compare, home: this.props.home, noLangToggleInHebrew: 1 });
      const contentClasses = classNames({content: 1, hasFooter: footer != null});
      return(<div className={classes} onClick={this.props.handleClick} key="0">
              {topContent}
              <div className={contentClasses}>
                <div className="contentInner">
                  { this.props.compare ? null : title }
                  { this.props.compare ? null : <Dedication /> }
                  { topUserData }
                  <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categories} />
                  { Sefaria._siteSettings.TORAH_SPECIFIC ? <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} enableAnchor={true} /> : null }
                  { !this.props.compare ? (<ReaderNavigationMenuSection title="Resources" heTitle="קהילה" content={resources} />) : null }
                  { Sefaria._siteSettings.TORAH_SPECIFIC ? <ReaderNavigationMenuSection title="Support Sefaria" heTitle="תמכו בספריא" content={donation} /> : null }
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

const TocLink = ({en, he, img, alt, href, resourcesLink, outOfAppLink, classes, onClick}) =>
    <a className={(resourcesLink?"resourcesLink ":"") + (outOfAppLink?"outOfAppLink ":"") + classes} href={href} onClick={onClick}>
        <img src={img} alt={alt} />
        <span className="int-en">{en}</span>
        <span className="int-he">{he}</span>
    </a>;

const Dedication = () => {

    //Get the local date 6 hours from now (so that dedication changes at 6pm local time
    let dedDate = new Date();
    dedDate.setHours(dedDate .getHours() + 6);
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const date = new Date(dedDate - tzoffset).toISOString().substring(0, 10);

    const [dedicationData, setDedicationData] = useState(Sefaria._tableOfContentsDedications[date]);

    const $url = 'https://spreadsheets.google.com/feeds/cells/1DWVfyX8H9biliNYEy-EfAd9F-8OotGnZG9jmOVNwojs/2/public/full?alt=json';

    async function fetchDedicationData(date) {
        const response = await $.getJSON($url).then(function (data) {
            return {data}
        });
        const dedicationData = response["data"]["feed"]["entry"];
        const enDedication = dedicationData[1]["content"]["$t"];
        const heDedication = dedicationData[2]["content"]["$t"];
        const enDedicationTomorrow = dedicationData[4]["content"]["$t"];
        const heDedicationTomorrow = dedicationData[5]["content"]["$t"];
        Sefaria._tableOfContentsDedications[dedicationData[0]["content"]["$t"]] = {"en": enDedication, "he": heDedication};
        Sefaria._tableOfContentsDedications[dedicationData[3]["content"]["$t"]] = {"en": enDedicationTomorrow, "he": heDedicationTomorrow};
        setDedicationData(Sefaria._tableOfContentsDedications[date]);
    }

    useEffect( () => {
        if (!dedicationData) {
            fetchDedicationData(date);
        }
    }, []);

    return (
        !dedicationData ? null :
        <div className="dedication">
          <span>
              <span className="en">{dedicationData.en}</span>
              <span className="he">{dedicationData.he}</span>
          </span>
        </div>
    );
};


module.exports = ReaderNavigationMenu;