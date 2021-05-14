import {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  ReaderNavigationMenuSearchButton,
} from './Misc';
import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';


const InPanelHeader = ({ mode, category, openDisplaySettings, navHome, compare, 
  catTitle, heCatTitle, onClose, openSearch,
}) => {
  if (mode === 'mainTOC') {
    const [query, setQuery] = React.useState("");
    const handleSearchKeyUp = event => {if (event.keyCode === 13 && query) { openSearch(query);}};
    const handleSearchButtonClick = () => {if (query) { openSearch(query);}};
    return (
      <div className="readerNavTop search">
        <CategoryColorLine category="Other" />
        <div className="readerNavTopStart">
          <ReaderNavigationMenuMenuButton onClick={onClose} compare={compare} />
          <div className="searchBox">
            <ReaderNavigationMenuSearchButton onClick={handleSearchButtonClick} />
            <input
              id="searchInput" className="readerSearch"
              title={Sefaria._("Search for Texts or Keywords Here")}
              placeholder={Sefaria._("Search")}
              onChange={e => setQuery(e.target.value)} value={query}
              onKeyUp={handleSearchKeyUp}
            />
          </div>
        </div>
        {Sefaria.interfaceLang !== "hebrew" ? 
        <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} />
        : null}
      </div>
    );
  }

  if (mode === 'innerTOC') {
    return (
      <div className={classNames({readerNavTop: 1, searchOnly: 1})}>
        <CategoryColorLine category={category} />
        <ReaderNavigationMenuMenuButton onClick={navHome} compare={compare} /> 
        <h2 className="readerNavTopCategory">
          <span className="en">{catTitle}</span>
          <span className="he">{heCatTitle}</span>
        </h2>
        
        {(Sefaria.interfaceLang === "hebrew" || !openDisplaySettings) ?
        <ReaderNavigationMenuDisplaySettingsButton placeholder={true} />
        : <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} />}
      </div>
    );
  }
}


export default InPanelHeader;