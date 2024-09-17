import React, { useState, useEffect, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Component from 'react-class';
import Sefaria  from './sefaria/sefaria';
import { useScrollToLoad } from "./Hooks";
import { NavSidebar } from './NavSidebar';
import Footer  from './Footer';
import { 
  SheetBlock,
  TextPassage
} from './Story';
import {
  CategoryColorLine,
  MenuButton,
  DisplaySettingsButton,
  TextBlockLink,
  LanguageToggleButton,
  LoadingMessage,
  InterfaceText,
} from './Misc';


const UserHistoryPanel = ({menuOpen, toggleLanguage, openDisplaySettings, openNav, compare, toggleSignUpModal}) => {
  const store = menuOpen === "saved" ? Sefaria.saved : Sefaria.userHistory;
  const contentRef = useRef();

  const title = (
    <span className="sans-serif">
      <a href="/texts/saved" className={"navTitleTab" + (menuOpen === "saved" ? " current" : "")}>
        <img src="/static/icons/bookmark.svg" />
        <InterfaceText>common.save</InterfaceText>
      </a>
      <a href="/texts/history" className={"navTitleTab" + (menuOpen === "history" ? " current" : "")}>
        <img src="/static/icons/clock.svg" />
        <InterfaceText>user.history</InterfaceText>
      </a>
    </span>
  );

  const sidebarModules = [
    {type: "Promo"},
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

  const footer = compare ? null : <Footer />;
  const navMenuClasses = classNames({readerNavMenu: 1, compare, noLangToggleInHebrew: 1});

  return (
    <div className={navMenuClasses}>
      <div className="content" ref={contentRef}>
        <div className="sidebarLayout">
          <div className="contentInner">
            <div className="navTitle sans-serif-in-hebrew">
              <h1>{ title }</h1>
              {Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
              <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null}
            </div>
            <UserHistoryList
              store={store}
              scrollableRef={contentRef}
              menuOpen={menuOpen}
              toggleSignUpModal={toggleSignUpModal}
              key={menuOpen}/>
          </div>
          <NavSidebar modules={sidebarModules} />
        </div>
        {footer}
      </div>
    </div>
    );
};
UserHistoryPanel.propTypes = {
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  openNav:             PropTypes.func.isRequired,
  compare:             PropTypes.bool,
  menuOpen:            PropTypes.string.isRequired,
};


const UserHistoryList = ({store, scrollableRef, menuOpen, toggleSignUpModal}) => {
  const [items, setItems] = useState(store.loaded ? store.items : null);

  // Store changes when switching tabs, reset items
  useEffect(() => {
    setItems(store.loaded ? store.items : null);
  }, [store]);

  useScrollToLoad({
    scrollableRef: scrollableRef,
    url: "/api/profile/user_history?secondary=0&annotate=1" + (menuOpen === "saved" ? "&saved=1" : ""),
    setter: data => {
      if (!store.loaded) {
        store.items = []; // saved intially has items that have not been annotated with text
        store.loaded = true;
      }
      store.items.push(...data);
      setItems(store.items.slice());
    },
    itemsPreLoaded: items ? items.length : 0,
  });

  if (menuOpen === 'history' && !Sefaria.is_history_enabled) {
    return (
      <div className="savedHistoryMessage">
        <span className={`${Sefaria.languageClassFont()}`}>Reading history is currently disabled. You can re-enable this feature in your <a href="/settings/account">{Sefaria._("header.profileMenu.account_settings")}</a>.</span>
      </div>
    );
  } else if (!items) {
    return <LoadingMessage />;
  } else if (items.length === 0) {
    return (
      <div className="savedHistoryMessage sans-serif">
        {menuOpen === "history" ?
        <InterfaceText>user_history_panel.text_sheet_available_here</InterfaceText>
        : <InterfaceText>bookmark.icon_description</InterfaceText>}
      </div>
    );
  }
  
  return (
    <div className="savedHistoryList">
      {items.reduce((accum, curr, index) => {
        // reduce consecutive history items with the same text/sheet
        if (!accum.length || menuOpen === "saved") {return accum.concat([curr]); }
        const prev = accum[accum.length-1];

        if (curr.is_sheet && curr.sheet_id === prev.sheet_id) {
          return accum;
        } else if (!curr.is_sheet && curr.book === prev.book) {
          return accum;
        } else {
          return accum.concat(curr);
        }
      }, [])
      .map((item, iitem) => {
        const key = item.ref + "|" + item.time_stamp + "|" + iitem;
        
        const timeStamp = menuOpen === "saved" ? null : (
          <div className="timeStamp sans-serif">
            { Sefaria.util.naturalTime(item.time_stamp, {short: true}) }
          </div>
        );

        if (item.is_sheet) {
          return <SheetBlock sheet={{
              sheet_id: item.sheet_id,
              sheet_title: item.title,
              publisher_name: item.ownerName,
              publisher_id: item.owner,
              publisher_image: item.ownerImageUrl,
              publisher_url: item.ownerProfileUrl,
              publisher_organization: item.ownerOrganization,
              publisher_followed: Sefaria.following.includes(item.owner),
            }}
            afterSave={timeStamp}
            smallfonts={true}
            key={key}
          />
        }else if (!!item?.text) {
          // item.versions
          return <TextPassage text={{
                ref: item.ref,
                heRef: item.he_ref,
                en: item.text.en,
                he: item.text.he,
                versions: item.versions,
              }}
             afterSave={timeStamp}
             toggleSignUpModal={toggleSignUpModal}
             key={key}
          />;
        }else{
          return null;
        }
      })}
    </div>
  );
};


export default UserHistoryPanel;