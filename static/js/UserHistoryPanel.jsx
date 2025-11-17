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
    if (menuOpen === 'notes' && Sefaria.activeModule === 'library') {
      Sefaria.allPrivateNotes((data) => {
        if (Array.isArray(data)) {
          const flattenedNotes = data.map(({ref, text}) => ({ref, text}));
          setNotes(flattenedNotes);
        } else {
          console.error('Unexpected data format:', data);
        }
      });
    }
  }, [menuOpen]);

  const currentDataStore = menuOpen === 'saved' ? Sefaria.saved : Sefaria.userHistory;
  const store = {
    'loaded': currentDataStore?.loaded || false,
    'items': currentDataStore?.items || []
  };

  const title = (
    <span className="sans-serif">
      <a href="/saved" 
        data-target-module={Sefaria.activeModule === 'library' ? Sefaria.LIBRARY_MODULE : Sefaria.VOICES_MODULE} 
        className={"navTitleTab" + (menuOpen === 'saved' ? ' current' : '') }
        onKeyDown={(e) => Util.handleKeyboardClick(e)}>
          <img src="/static/icons/bookmark.svg" alt={Sefaria._("Saved")} />
          <InterfaceText>Saved</InterfaceText>
      </a>
      <a href="/history" 
        className={"navTitleTab" + (menuOpen === 'history' ? ' current' : '')}
        data-target-module={Sefaria.activeModule === 'library' ? Sefaria.LIBRARY_MODULE : Sefaria.VOICES_MODULE}
        onKeyDown={(e) => Util.handleKeyboardClick(e)}>
          <img src="/static/icons/clock.svg" alt={Sefaria._("History")} />
          <InterfaceText>History</InterfaceText>
      </a>
      { Sefaria.activeModule === "library" &&
        <a 
           href="/texts/notes" 
           className={"navTitleTab" + (menuOpen === 'notes' ? ' current' : '')}
           onKeyDown={(e) => Util.handleKeyboardClick(e)}
        >
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
              {Sefaria.multiPanel && Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC &&
              <LanguageToggleButton toggleLanguage={toggleLanguage} />}
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


const dedupeItems = (items) => {
  /*
  Deduplicates consecutive items with the same book or sheet_id.  
  Essentially, we don't want two history items in a row that are of the same book (or if we're in voices, the same sheet).
  :param items: list of UserHistory objects to deduplicate
  :return: list of deduplicated items
  */
  const deduped = [];
  const key = Sefaria.activeModule === Sefaria.VOICES_MODULE ? 'sheet_id' : 'book';  
  let prevValue;
  for (const item of items) {
    if (item[key] !== prevValue) { // item[key] is the name of the sheet or book
      deduped.push(item);
      prevValue = item[key];
    }
  }
  return deduped;
};


const UserHistoryList = ({store, scrollableRef, menuOpen, toggleSignUpModal}) => {
  // Store raw items in state (never deduped)
  const [rawItems, setRawItems] = useState(store.loaded ? store.items.slice() : null);
  
  const params = new URLSearchParams({
    saved:  +(menuOpen === 'saved'),
    sheets_only: +(Sefaria.activeModule === Sefaria.VOICES_MODULE),
    secondary: 0,
    annotate: 1,
  });

  useScrollToLoad({
    scrollableRef: scrollableRef,
    url: `/api/profile/user_history?${params.toString()}`,
    setter: data => {
      if (!store.loaded) {
        store.items = []; // Initialize items only once
        store.loaded = true;
      }

      // Push the raw data into the store (no deduping yet)
      store.items.push(...data);

      // Update state with raw data - useMemo will handle transformation
      setRawItems(store.items.slice());
    },
    itemsPreLoaded: rawItems ? rawItems.length : 0,
  });
  
    
  // Compute display items: dedupe for history, keep as-is for saved
  let items;    
  if (rawItems) {
    items = menuOpen === 'saved' ? rawItems : dedupeItems(rawItems);
  }
  
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
