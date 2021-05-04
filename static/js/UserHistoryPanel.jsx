import {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  TextBlockLink,
  LanguageToggleButton,
  LoadingMessage,
  InterfaceText,
} from './Misc';
import React, { useState, useEffect } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import { NavSidebar } from './NavSidebar';
import Footer  from './Footer';
import Component from 'react-class';


const UserHistoryPanel = ({menuOpen, handleClick, toggleLanguage, openDisplaySettings, openNav, compare}) => {
  const [items, setItems] = useState(menuOpen === "saved" ? Sefaria.saved : Sefaria._userHistory.history);

  useEffect(() => {
    if (menuOpen === "history") {
      if (Sefaria._userHistory.history) {
        setItems(Sefaria._userHistory.history);
      } else {
        Sefaria.userHistoryAPI().then( items => {
          setItems(items);
        });        
      }
    } else {
      setItems(Sefaria.saved);
    }
  }, [menuOpen]);

  const content = (menuOpen === 'history' && !Sefaria.is_history_enabled) ? (
      <div id="history-disabled-msg">
        <span className="int-en">Reading history is currently disabled. You can re-enable this feature in your <a href="/settings/account">account settings</a>.</span>
        <span className="int-he">היסטורית קריאה כבויה כרגע. ניתן להפעילה מחדש במסך <a href="/settings/account">ההגדרות</a>.</span>
      </div>
  ) : !!items ?
    items.reduce((accum, curr, index) => (  // reduce consecutive history items with the same ref
      (!accum.length || curr.ref !== accum[accum.length-1].ref) ? accum.concat([curr]) : accum
    ), [])
    .map((item, iitem) =>
     (<TextBlockLink
        sref={item.ref}
        heRef={item.he_ref}
        book={item.book}
        currVersions={item.versions}
        sheetOwner={item.sheet_owner}
        sheetTitle={item.sheet_title}
        timeStamp={item.time_stamp}
        showSections={true}
        recentItem={true}
        sideColor={true}
        saved={menuOpen === 'saved'}
        key={item.ref + "|" + item.time_stamp + "|" + iitem }
    />)
  ) : (<LoadingMessage />);

  const sidebarModules = [
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

  const title = (
    <span className="sans-serif">
      <a href="/texts/saved" className={"navTitleTab" + (menuOpen === "saved" ? " current" : "")}>
        <img src="/static/icons/bookmark.svg" />
        <InterfaceText>Saved</InterfaceText>
      </a>
      <a href="/texts/history" className={"navTitleTab" + (menuOpen === "history" ? " current" : "")}>
        <img src="/static/icons/clock.svg" />
        <InterfaceText>History</InterfaceText>
      </a>
    </span>
  );

  const footer = compare ? null : <Footer />;
  const navMenuClasses = classNames({recentPanel: 1, readerNavMenu: 1, compare: compare, noLangToggleInHebrew: 1});
  
  return (
    <div onClick={handleClick} className={navMenuClasses}>
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            <div className="navTitle sans-serif-in-hebrew">
              <h1>{ title }</h1>
              {Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null}
            </div>
            { content }
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        {footer}
      </div>
    </div>
    );
};
UserHistoryPanel.propTypes = {
  handleClick:         PropTypes.func.isRequired,
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  openNav:             PropTypes.func.isRequired,
  compare:             PropTypes.bool,
  menuOpen:            PropTypes.string.isRequired,
};


export default UserHistoryPanel;