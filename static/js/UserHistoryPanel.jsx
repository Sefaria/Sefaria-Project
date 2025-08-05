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


const filterDataByType = (data, dataSource) => {
  return data.filter(item => {
    if (dataSource === 'sheets') {
      return item.is_sheet;
    } else {
      return !item.is_sheet; // Keep only non-sheets (texts)
    }
  });
}

const UserHistoryPanel = ({menuOpen, toggleLanguage, openDisplaySettings, openNav, compare, toggleSignUpModal, dataSource}) => {

  const initialStore = menuOpen === 'texts-saved' || menuOpen === 'sheets-saved' ? Sefaria.saved : Sefaria.userHistory;

  const [notes, setNotes] = useState(null);
  const [dataStore, setDataStore] = useState(initialStore);

  const contentRef = useRef();

  useEffect(() => {
    Sefaria.allPrivateNotes((data) => {
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
  }, []);

  useEffect(() => {
    // Switch dataStore whenever menuOpen changes
    const newDataStore = menuOpen === 'texts-saved' || menuOpen === 'sheets-saved' ? Sefaria.saved : Sefaria.userHistory;
    setDataStore(newDataStore);
  }, [menuOpen, Sefaria.saved, Sefaria.userHistory]);

  const libraryURLs = {
    "saved": "/texts/saved",
    "history": "/texts/history"
  };
  const sheetsURLs = {
    "saved": "/sheets/saved",
    "history": "/sheets/history"
  };

  const title = (
    <span className="sans-serif">
      <a href={ dataSource === 'library' ?  libraryURLs.saved : sheetsURLs.saved } data-attr={dataSource} className={"navTitleTab" + (menuOpen === 'texts-saved' || menuOpen === 'sheets-saved' ? ' current' : '') }>
        <img src="/static/icons/bookmark.svg" />
        <InterfaceText>Saved</InterfaceText>
      </a>
      <a href={ dataSource === "library" ?  libraryURLs.history : sheetsURLs.history } data-attr={dataSource} className={"navTitleTab" + (menuOpen === 'texts-history' || menuOpen === 'sheets-history' ? ' current' : '')}>
        <img src="/static/icons/clock.svg" />
        <InterfaceText>History</InterfaceText>
      </a>
      { dataSource === "library" &&
        <a href="/texts/notes" className={"navTitleTab" + (menuOpen === 'notes' ? ' current' : '')}>
        <img src="/static/icons/notes-icon.svg" />
        <InterfaceText>Notes</InterfaceText>
      </a> }
    </span>
  );

  const sheetsDataStore = {'loaded': true, 'items': filterDataByType(dataStore?.items, 'sheets')};
  const libraryDataStore =  {'loaded': true, 'items': filterDataByType(dataStore?.items, 'library')};

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
                    store={ dataSource === 'sheets' ? sheetsDataStore : libraryDataStore }
                    scrollableRef={contentRef}
                    menuOpen={menuOpen}
                    toggleSignUpModal={toggleSignUpModal}
                    key={menuOpen}
                    dataSource={dataSource}/>
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


const LibraryUserHistoryPanelWrapper = (menuOpen, toggleLanguage, openDisplaySettings, openNav, compare, toggleSignUpModal) => {
  return (
    <UserHistoryPanel menuOpen={menuOpen.menuOpen}
                      toggleLanguage={toggleLanguage}
                      openDisplaySettings={openDisplaySettings}
                      openNav={openNav}
                      compare={compare}
                      toggleSignUpModal={toggleSignUpModal}
                      dataSource={'library'} />
  )
};

const SheetsUserHistoryPanelWrapper = (menuOpen, toggleLanguage, openDisplaySettings, openNav, compare, toggleSignUpModal) => {
  return (
    <UserHistoryPanel menuOpen={menuOpen.menuOpen}
                      toggleLanguage={toggleLanguage}
                      openDisplaySettings={openDisplaySettings}
                      openNav={openNav}
                      compare={compare}
                      toggleSignUpModal={toggleSignUpModal}
                      dataSource={'sheets'} />
  )
};

const UserHistoryList = ({store, scrollableRef, menuOpen, toggleSignUpModal, dataSource}) => {
  const [items, setItems] = useState(store.loaded ? store.items : null);

  // Store changes when switching tabs, reset items
  useEffect(() => {
    setItems(store.loaded ? store.items : null);
  }, [store]);

  useScrollToLoad({
    scrollableRef: scrollableRef,
    url: "/api/profile/user_history?secondary=0&annotate=1" + ((menuOpen === 'sheets-saved' || menuOpen === 'texts-saved') ? '&saved=1' : ''),
    setter: data => {
      if (!store.loaded) {
        store.items = []; // Initialize items only once
        store.loaded = true;
      }

      // Filter the data based on whether it's a sheet or not
      const filteredData = filterDataByType(data, dataSource);

      // Push the filtered data into the store
      store.items.push(...filteredData);

      // Update the state with the modified items array
      setItems(store.items.slice());

    },
    itemsPreLoaded: items ? items.length : 0,
  });


  if ((menuOpen === 'texts-history' || menuOpen === 'sheets-history') && !Sefaria.is_history_enabled) {
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
        {(menuOpen === 'texts-history' || menuOpen === "sheets-history") ?
        <InterfaceText>Texts and sheets that you read will be available for you to see here.</InterfaceText>
        : <InterfaceText>Click the bookmark icon on texts or sheets to save them here.</InterfaceText>}
      </div>
    );
  }
  
  return (
    <div className="savedHistoryList">
      {items.reduce((accum, curr, index) => {
        // reduce consecutive history items with the same text/sheet
        if (!accum.length || (menuOpen === 'texts-saved' || menuOpen === 'sheets-saved')) {return accum.concat([curr]); }
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
        
        const timeStamp = (menuOpen === 'texts-saved' || menuOpen === 'sheets-saved') ? null : (
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
export { SheetsUserHistoryPanelWrapper, LibraryUserHistoryPanelWrapper };
