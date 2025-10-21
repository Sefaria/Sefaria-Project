import React, { useState, useEffect, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import { useScrollToLoad } from "./Hooks";
import { NavSidebar } from './NavSidebar';
import { NotesList } from './NoteListing';
import {
  SheetBlock,
  TextPassage
} from './Story';
import {
  LanguageToggleButton,
  LoadingMessage,
  InterfaceText,
} from './Misc';
import Util from './sefaria/util';


const UserHistoryPanel = ({menuOpen, toggleLanguage, openDisplaySettings, openNav, compare, toggleSignUpModal}) => {

  const [notes, setNotes] = useState(null);
  const contentRef = useRef();

  useEffect(() => {
    menuOpen === 'notes' && Sefaria.activeModule === 'library' && Sefaria.allPrivateNotes((data) => {
      if (Array.isArray(data)) {
        const flattenedNotes = data.map(note => ({
          ref: note.ref,
          text: note.text
        }));
        setNotes(flattenedNotes);
      } else {
        console.error('Unexpected data format:', data);
      }
    });
  }, [menuOpen]);

  const currentDataStore = menuOpen === 'saved' ? Sefaria.saved : Sefaria.userHistory;
  const store = {
    'loaded': currentDataStore?.loaded || false, 
    'items': currentDataStore?.items || []
  };

  const title = (
    <span className="sans-serif">
      <a href="/saved" data-target-module={Sefaria.activeModule === 'library' ? Sefaria.LIBRARY_MODULE : Sefaria.VOICES_MODULE} 
      className={"navTitleTab" + (menuOpen === 'saved' ? ' current' : '') }
      onKeyDown={(e) => Util.handleKeyboardClick(e)}>
        <img src="/static/icons/bookmark.svg" alt={Sefaria._("Saved")} />
        <InterfaceText>Saved</InterfaceText>
      </a>
      <a href="/history" data-target-module={Sefaria.activeModule === 'library' ? Sefaria.LIBRARY_MODULE : Sefaria.VOICES_MODULE} 
      className={"navTitleTab" + (menuOpen === 'history' ? ' current' : '')}
      onKeyDown={(e) => Util.handleKeyboardClick(e)}>
        <img src="/static/icons/clock.svg" alt={Sefaria._("History")} />
        <InterfaceText>History</InterfaceText>
      </a>
      { Sefaria.activeModule === "library" &&
        <a href="/texts/notes" className={"navTitleTab" + (menuOpen === 'notes' ? ' current' : '')}
        onKeyDown={(e) => Util.handleKeyboardClick(e)}>
        <img src="/static/icons/notes-icon.svg" alt={Sefaria._("Notes")} />
        <InterfaceText>Notes</InterfaceText>
      </a> }
    </span>
  );

  const sidebarModules = [
    {type: "Promo"},
    {type: "GetTheApp"},
    {type: "SupportSefaria"},
  ];

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
            { menuOpen === 'notes' ?
                  <NotesList notes={notes} />
                 :
                  <UserHistoryList
                    store={store}
                    scrollableRef={contentRef}
                    menuOpen={menuOpen}
                    toggleSignUpModal={toggleSignUpModal}
                    key={menuOpen}/>
            }
          </div>
          <NavSidebar sidebarModules={sidebarModules} />
        </div>
      </div>
    </div>
  );
};

UserHistoryPanel.propTypes = {
  toggleLanguage:      PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func.isRequired,
  openNav:             PropTypes.func,
  compare:             PropTypes.bool,
  menuOpen:            PropTypes.string.isRequired,
};


const UserHistoryList = ({store, scrollableRef, menuOpen, toggleSignUpModal}) => {
  const [items, setItems] = useState(store.loaded ? store.items : null);

  // Store changes when switching tabs, reset items
  useEffect(() => {
    setItems(store.loaded ? store.items : null);
  }, [menuOpen]);
  
  const savedParam = menuOpen === 'saved' ? '&saved=1' : '';
  const voicesParam = Sefaria.activeModule === Sefaria.VOICES_MODULE ? '&voices=1' : '';

  useScrollToLoad({
    scrollableRef: scrollableRef,
    url: "/api/profile/user_history?secondary=0&annotate=1" + savedParam + voicesParam,
    setter: data => {
      if (!store.loaded) {
        store.items = []; // Initialize items only once
        store.loaded = true;
      }

      // Push the data into the store (already filtered and deduped by backend)
      store.items.push(...data);

      // Update the state with the modified items array
      setItems(store.items.slice());

    },
    itemsPreLoaded: items ? items.length : 0,
  });


  if (menuOpen === 'history' && !Sefaria.is_history_enabled) {
    return (
      <div className="savedHistoryMessage">
        <span className="int-en">Reading history is currently disabled. You can re-enable this feature in your <a href="/settings/account">account settings</a>.</span>
        <span className="int-he">היסטורית קריאה כבויה כרגע. ניתן להפעילה מחדש במסך <a href="/settings/account">ההגדרות</a>.</span>
      </div>
    );
  } else if (!items) {
    return <LoadingMessage />;
  } else if (items.length === 0) {
    return (
      <div className="savedHistoryMessage sans-serif">
        {menuOpen === 'history' ?
        <InterfaceText>Texts and sheets that you read will be available for you to see here.</InterfaceText>
        : <InterfaceText>Click the bookmark icon on texts or sheets to save them here.</InterfaceText>}
      </div>
    );
  }
  
  return (
    <div className="savedHistoryList">
      {items.map((item, iitem) => {
        const key = item.ref + "|" + item.time_stamp + "|" + iitem;
        
        const timeStamp = (menuOpen === 'saved') ? null : (
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
