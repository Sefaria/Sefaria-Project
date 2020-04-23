const {
  CategoryColorLine,
  ReaderNavigationMenuMenuButton,
  ReaderNavigationMenuDisplaySettingsButton,
  ReaderNavigationMenuSearchButton,
}                         = require('./Misc');
const React               = require('react');
const classNames          = require('classnames');
const PropTypes           = require('prop-types');

const MobileHeader = ({
  mode, hideNavHeader, interfaceLang, category, openDisplaySettings, navHome,
  compare, catTitle, heCatTitle, onClose, openSearch,
}) => {
  if (mode === 'home') {
    return (<div className="readerNavTop search">
      <CategoryColorLine category="Other" />
      <ReaderNavigationMenuSearchButton onClick={navHome} />
      <div className='sefariaLogo'><img src="/static/img/logo.svg" alt="Sefaria Logo" /></div>
      {interfaceLang !== "hebrew" ?
        <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} />
        : <ReaderNavigationMenuDisplaySettingsButton placeholder={true} /> }
    </div>);
  }
  if (mode === 'mainTOC') {
    const [query, setQuery] = React.useState("");
    const handleSearchKeyUp = event => {if (event.keyCode === 13 && query) { openSearch(query);}};
    const handleSearchButtonClick = () => {if (query) { openSearch(query);}};
    return (
      <div className="readerNavTop search">
        <CategoryColorLine category="Other" />
        <div className="readerNavTopStart">
          <ReaderNavigationMenuMenuButton onClick={onClose} compare={compare} interfaceLang={interfaceLang}/>
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
        {interfaceLang !== "hebrew" ? <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} /> : null}
      </div>
    );
  }
  if (mode === 'innerTOC') {
    return (
      <div className={classNames({readerNavTop: 1, searchOnly: 1, colorLineOnly: hideNavHeader})}>
        <CategoryColorLine category={category} />
        {hideNavHeader ? null : (<ReaderNavigationMenuMenuButton onClick={navHome} compare={compare} interfaceLang={interfaceLang}/>)}
        {hideNavHeader ? null : (<h2 className="readerNavTopCategory">
          <span className="en">{catTitle}</span>
          <span className="he">{heCatTitle}</span>
        </h2>)}
        {hideNavHeader ? null :
          ((interfaceLang === "hebrew" || !openDisplaySettings) ?
            <ReaderNavigationMenuDisplaySettingsButton placeholder={true} />
            : <ReaderNavigationMenuDisplaySettingsButton onClick={openDisplaySettings} />)}
      </div>
    );
  }
}

module.exports = MobileHeader;
