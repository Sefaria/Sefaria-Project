import React  from 'react';
import classNames  from 'classnames';
import PropTypes  from 'prop-types';
import Sefaria  from './sefaria/sefaria';
import {
  CategoryColorLine,
  MenuButton,
  DisplaySettingsButton,
  SearchButton,
} from './Misc';
import {ContentText} from "./ContentText";

const ComparePanelHeader = ({ search, category, openDisplaySettings, navHome, catTitle, heCatTitle, 
  onBack, openSearch
}) => {
  if (search) {
    const [query, setQuery] = React.useState("");
    const handleSearchKeyUp = event => {if (event.keyCode === 13 && query) { openSearch(query);}};
    const handleSearchButtonClick = () => {if (query) { openSearch(query);}};
    return (
      <div className="readerNavTop search">
        <CategoryColorLine category="System" />
        <div className="readerNavTopStart">
          <MenuButton onClick={onBack} compare={true} />
          <div className="searchBox">
            <SearchButton onClick={handleSearchButtonClick} />
            <input
              id="searchInput" className="readerSearch"
              title={Sefaria._("search_text_or_keywords")}
              placeholder={Sefaria._("common.placeholder.search")}
              onChange={e => setQuery(e.target.value)} value={query}
              onKeyUp={handleSearchKeyUp}
            />
          </div>
        </div>
        {Sefaria.interfaceLang !== "hebrew" ? 
        <DisplaySettingsButton onClick={openDisplaySettings} />
        : null}
      </div>
    );
  } else {
    return (
      <div className={classNames({readerNavTop: 1, searchOnly: 1})}>
        <CategoryColorLine category={category} />
        <MenuButton onClick={onBack} compare={true} /> 
        <h2 className="readerNavTopCategory">
          <ContentText text={{en: catTitle, he: heCatTitle}} />
        </h2>
        
        {(Sefaria.interfaceLang === "hebrew" || !openDisplaySettings) ?
        <DisplaySettingsButton placeholder={true} />
        : <DisplaySettingsButton onClick={openDisplaySettings} />}
      </div>
    );
  }
}


export default ComparePanelHeader;