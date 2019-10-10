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
const {TopicCategory}              = require('./TopicPage');
import React, { useState, useEffect, useRef } from 'react';
const ReactDOM                     = require('react-dom');
const PropTypes                    = require('prop-types');
const classNames                   = require('classnames');
const Sefaria                      = require('./sefaria/sefaria');
const $                            = require('./sefaria/sefariaJquery');
const ReaderNavigationCategoryMenu = require('./ReaderNavigationCategoryMenu');
const Footer                       = require('./Footer');
import Component from 'react-class';

// The Navigation menu for browsing and searching texts, plus some site links.
const ReaderNavigationMenu = ({categories, topic, settings, setCategories, setNavTopic, setTopic, setOption, onClose, openNav, openSearch,
          toggleLanguage, openMenu, onTextClick, onRecentClick, handleClick, openDisplaySettings, toggleSignUpModal,
          hideHeader, hideNavHeader, multiPanel, home, compare, interfaceLang}) => {

  const [width, setWidth] = useState(1000);
  const [showMore, setShowMore] = useState(Sefaria.toc.length < 9);
  const [showMoreTopics, setShowMoreTopics] = useState(false);

  const ref = useRef(null);
  useEffect(() => {
    deriveAndSetWidth();
    window.addEventListener("resize", deriveAndSetWidth);
    return () => {
        window.removeEventListener("resize", deriveAndSetWidth);
    }
  }, []);

  const deriveAndSetWidth = () => setWidth(ref.current ? ref.current.offsetWidth : 1000);
  
  const navHome = () => {
    setCategories([]);
    setNavTopic("");
    openNav();
  };
  
  const enableShowMore = (event) => {
    event.preventDefault();
    setShowMore(true);
  };
  const enableShowMoreTopics = (event) => {
    event.preventDefault();
    setShowMoreTopics(true);
  };
  
  const handleSearchKeyUp = (event) => {
    if (event.keyCode === 13) {
      const query = $(event.target).val();
      openSearch(query);
    }
  };
  
  const handleSearchButtonClick = (event) => {
    const query = $(ReactDOM.findDOMNode(ref.current)).find(".readerSearch").val();
    if (query) {
      openSearch(query);
    }
  };

  const openSaved = () => (Sefaria._uid) ? openMenu("saved") : toggleSignUpModal();

  // List of Texts in a Category
  if (categories.length) {
    return (
        <div ref={ref} className="readerNavMenu" onClick={handleClick} >
            <ReaderNavigationCategoryMenu
              categories={categories}
              category={categories.slice(-1)[0]}
              closeNav={onClose}
              setCategories={setCategories}
              toggleLanguage={toggleLanguage}
              openDisplaySettings={openDisplaySettings}
              navHome={navHome}
              compare={compare}
              hideNavHeader={hideNavHeader}
              width={width}
              contentLang={settings.language}
              interfaceLang={interfaceLang} />
        </div>
    );
  }

  // Topics List
  if (topic.length) {
    return (
        <div ref={ref} className="readerNavMenu" onClick={handleClick} >
            <TopicCategory
              topic={topic}
              setTopic={setTopic}
              toggleLanguage={toggleLanguage}
              contentLang={settings.language}
              interfaceLang={interfaceLang}
              width={width}
              multiPanel={multiPanel}
            />
        </div>
    )
  }
  // Root Library Menu
  let categoriesBlock = Sefaria.toc.map(cat => {
    const style = {"borderColor": Sefaria.palette.categoryColor(cat.category)};
    const openCat = e => {e.preventDefault(); setCategories([cat.category])};
    return (<a href={`/texts/${cat.category}`} className="readerNavCategory" data-cat={cat.category} style={style} onClick={openCat}>
                <span className="en">{cat.category}</span>
                <span className="he">{cat.heCategory}</span>
              </a>
            );
  });
  const more = (<a href="#" className="readerNavCategory readerNavMore" onClick={enableShowMore}>
                  <span className="int-en">More <img src="/static/img/arrow-right.png" alt="" /></span>
                  <span className="int-he">עוד <img src="/static/img/arrow-left.png" alt="" /></span>
              </a>);
  const nCats  = width < 500 ? 9 : 8;
  categoriesBlock = showMore ? categoriesBlock : categoriesBlock.slice(0, nCats).concat(more);
  categoriesBlock = (<div className="readerNavCategories"><TwoOrThreeBox content={categoriesBlock} width={width} /></div>);


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
  calendar = (<div className="readerNavCalendar"><TwoOrThreeBox content={calendar} width={width} /></div>);


  let resources = [
      <TocLink en="Source Sheets" he="דפי מקורות" href="/sheets" resourcesLink={true} onClick={openMenu.bind(null, "sheets")}
            img="/static/img/sheet-icon.png"  alt="source sheets icon"/>,
      <TocLink en="Visualizations" he="תרשימים גרפיים" href="/visualizations" resourcesLink={true} outOfAppLink={true}
            img="/static/img/visualizations-icon.png" alt="visualization icon" />,
      <TocLink en="Authors" he="רשימת מחברים" href="/people" resourcesLink={true} outOfAppLink={true}
            img="/static/img/authors-icon.png" alt="author icon"/>,
      <TocLink en="Topics" he="נושאים" href="/topics" resourcesLink={true} onClick={openMenu.bind(null, "topics")}
            img="/static/img/hashtag-icon.svg" alt="resources icon" />,
      <TocLink en="Groups" he="קבוצות" href="/groups" resourcesLink={true} outOfAppLink={true}
            img="/static/img/group.svg" alt="Groups icon"/>
  ];

  const torahSpecificResources = ["/visualizations", "/people"];
  if (!Sefaria._siteSettings.TORAH_SPECIFIC) {
    resources = resources.filter(r => torahSpecificResources.indexOf(r.props.href) == -1);
  }
  resources = (<div className="readerTocResources"><TwoBox content={resources} width={width} /></div>);


  const topContent = hideNavHeader ? null : home ?
          (<div className="readerNavTop search">
            <CategoryColorLine category="Other" />
            <ReaderNavigationMenuSearchButton onClick={navHome} />
            <div className='sefariaLogo'><img src="/static/img/logo.svg" alt="Sefaria Logo" /></div>
            {interfaceLang !== "hebrew" ?
              <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} />
              : <ReaderNavigationMenuDisplaySettingsButton placeholder={true} /> }
          </div>) :
          (<div className="readerNavTop search">
            <CategoryColorLine category="Other" />
            <div className="readerNavTopStart">
              <ReaderNavigationMenuMenuButton onClick={onClose} compare={compare} interfaceLang={interfaceLang}/>
              <div className="searchBox">
                <ReaderNavigationMenuSearchButton onClick={handleSearchButtonClick} />
                <input id="searchInput" className="readerSearch" title={Sefaria._("Search for Texts or Keywords Here")} placeholder={Sefaria._("Search")} onKeyUp={handleSearchKeyUp} />
              </div>
            </div>
            {interfaceLang !== "hebrew" ? <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} /> : null}
          </div>);

  let topUserData = [
      <TocLink en="Saved" he="שמורים" href="/texts/saved" resourcesLink={true} onClick={openSaved} img="/static/img/star.png" alt="saved text icon"/>,
      <TocLink en="History" he="היסטוריה" href="/texts/history" resourcesLink={true} onClick={openMenu.bind(null, "history")} img="/static/img/clock.png" alt="history icon"/>
  ];
  topUserData = (<div className="readerTocResources userDataButtons"><TwoBox content={topUserData} width={width} /></div>);

  let donation  = [
      <TocLink en="Make a Donation" he="בצעו תרומה" resourcesLink={true} outOfAppLink={true} classes="donationLink" img="/static/img/heart.png" alt="donation icon" href="https://sefaria.nationbuilder.com/supportsefaria"/>,
      <TocLink en="Sponsor a day" he="תרום יום לימוד" resourcesLink={true} outOfAppLink={true} classes="donationLink" img="/static/img/calendar.svg" alt="donation icon" href="https://sefaria.nationbuilder.com/sponsor"/>,
  ];

  donation = (<div className="readerTocResources"><TwoBox content={donation} width={width} /></div>);


  let topicBlocks = Sefaria.topicTocPage().map((t,i) => {
      const openTopic = e => {e.preventDefault(); setNavTopic(t.name)};
      return <a href={"/topics/category/" + t.name}
         onClick={openTopic}
         className="blockLink"
         key={i}>
          <span className='en'>{t.en}</span>
          <span className='he'>{t.he}</span>
      </a>
  });
  const moreTopics = (<a href="#" className="blockLink readerNavMore" onClick={enableShowMoreTopics}>
                  <span className="int-en">More <img src="/static/img/arrow-right.png" alt="" /></span>
                  <span className="int-he">עוד <img src="/static/img/arrow-left.png" alt="" /></span>
              </a>);
  topicBlocks = showMoreTopics ? topicBlocks : topicBlocks.slice(0, nCats).concat(moreTopics);
  const topicsBlock = (<div className="readerTocTopics"><TwoOrThreeBox content={topicBlocks} width={width} /></div>);


  const title = (<h1>
                { multiPanel && interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
                 <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
                <span className="int-en">{Sefaria._siteSettings.LIBRARY_NAME.en}</span>
                <span className="int-he">{Sefaria._siteSettings.LIBRARY_NAME.he}</span>
              </h1>);

  const footer = compare ? null : <Footer />;
  const classes = classNames({readerNavMenu:1, noHeader: !hideHeader, compare: compare, home: home, noLangToggleInHebrew: 1 });
  const contentClasses = classNames({content: 1, hasFooter: footer != null});

  return(<div ref={ref} className={classes} onClick={handleClick} key="0">
          {topContent}
          <div className={contentClasses}>
            <div className="contentInner">
              { compare ? null : title }
              { compare ? null : <Dedication /> }
              { topUserData }
              <ReaderNavigationMenuSection title="Browse" heTitle="טקסטים" content={categoriesBlock} />
              { Sefaria._siteSettings.TORAH_SPECIFIC ? <ReaderNavigationMenuSection title="Calendar" heTitle="לוח יומי" content={calendar} enableAnchor={true} /> : null }
              <ReaderNavigationMenuSection title="Topics" heTitle="נושאים" content={topicsBlock} />
              { !compare ? (<ReaderNavigationMenuSection title="Resources" heTitle="קהילה" content={resources} />) : null }
              { Sefaria._siteSettings.TORAH_SPECIFIC ? <ReaderNavigationMenuSection title="Support Sefaria" heTitle="תמכו בספריא" content={donation} /> : null }
              { multiPanel ? null : siteLinks }
            </div>
            {footer}
          </div>
        </div>);

};
ReaderNavigationMenu.propTypes = {
  categories:        PropTypes.array.isRequired,
  topic:            PropTypes.string.isRequired,
  settings:          PropTypes.object.isRequired,
  setCategories:     PropTypes.func.isRequired,
  setNavTopic:         PropTypes.func.isRequired,
  setOption:         PropTypes.func.isRequired,
  onClose:           PropTypes.func.isRequired,
  openNav:           PropTypes.func.isRequired,
  openSearch:        PropTypes.func.isRequired,
  openMenu:          PropTypes.func.isRequired,
  onTextClick:       PropTypes.func.isRequired,
  onRecentClick:     PropTypes.func.isRequired,
  handleClick:       PropTypes.func.isRequired,
  toggleSignUpModal: PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func,
  toggleLanguage:    PropTypes.func,
  hideNavHeader:     PropTypes.bool,
  hideHeader:        PropTypes.bool,
  multiPanel:        PropTypes.bool,
  home:              PropTypes.bool,
  compare:           PropTypes.bool,
  interfaceLang:     PropTypes.string,
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