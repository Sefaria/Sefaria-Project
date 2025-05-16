import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Sefaria from './sefaria/sefaria';
import $ from './sefaria/sefariaJquery';
import { NavSidebar, Modules } from './NavSidebar';
import TextCategoryPage from './TextCategoryPage';
import Footer from './Footer';
import ComparePanelHeader from './ComparePanelHeader';
import {
  TextBlockLink,
  TwoOrThreeBox,
  NBox,
  ResponsiveNBox,
  LanguageToggleButton,
  InterfaceText,
  CategoryHeader
} from './Misc';
import { ContentText } from "./ContentText";

const TextsPage = ({ categories, settings, setCategories, onCompareBack, openSearch,
  toggleLanguage, openTextTOC, openDisplaySettings, multiPanel, initialWidth, compare }) => {
  // List of Texts in a Category
  if (categories.length) {
    return (
      <div className="readerNavMenu">
        <TextCategoryPage
          categories={categories}
          category={categories.slice(-1)[0]}
          setCategories={setCategories}
          openTextTOC={openTextTOC}
          toggleLanguage={toggleLanguage}
          openDisplaySettings={openDisplaySettings}
          compare={compare}
          multiPanel={multiPanel}
          initialWidth={initialWidth} />
      </div>
    );
  }

  // Root Library Menu
  let categoryListings = Sefaria.toc.map((cat, i) => {
    const style = { "borderColor": Sefaria.palette.categoryColor(cat.category) };
    const openCat = e => { e.preventDefault(); setCategories([cat.category]) };

    return (
      <div className="navBlock withColorLine" style={style} key={i}>
        <a href={`/texts/${cat.category}`} className="navBlockTitle" data-cat={cat.category} onClick={openCat}>
          <ContentText key={{ en: cat.category, he: cat.heCategory }} text={{ en: cat.category, he: cat.heCategory }} defaultToInterfaceOnBilingual={true} />
        </a>
        <div className="navBlockDescription">
          <ContentText key={{ en: cat.enShortDesc, he: cat.heShortDesc }} text={{ en: cat.enShortDesc, he: cat.heShortDesc }} defaultToInterfaceOnBilingual={true} />
        </div>
      </div>
    );
  });

  categoryListings = (
    <div className="readerNavCategories">
      <ResponsiveNBox content={categoryListings} initialWidth={initialWidth} />
    </div>
  );

  const comparePanelHeader = compare ?
    <ComparePanelHeader
      search={true}
      onBack={onCompareBack}
      openDisplaySettings={openDisplaySettings}
      openSearch={openSearch}
    /> : null;

  // Adjusted title without LanguageToggleButton
  const title = compare ? null :
    <div className="navTitle tight sans-serif">
      <CategoryHeader type="cats" buttonsToDisplay={["subcategory", "reorder"]}>
        {/* <h1><InterfaceText>home.browse_text</InterfaceText></h1> */}
      </CategoryHeader>
    </div>;

  const about = compare || multiPanel ? null :
    <Modules type={"AboutSefaria"} props={{ hideTitle: true }} />;

  const dedication = Sefaria._siteSettings.TORAH_SPECIFIC && !compare ? <Dedication /> : null;

  // Moved LanguageToggleButton here, below dedication
  const languageToggle = multiPanel && Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC && !compare ?
    <div className="language-toggle-box">
      <LanguageToggleButton toggleLanguage={toggleLanguage} />
    </div> : null;

  const libraryMessage = Sefaria._siteSettings.LIBRARY_MESSAGE && !compare ?
    <div className="libraryMessage" dangerouslySetInnerHTML={{ __html: Sefaria._siteSettings.LIBRARY_MESSAGE }}></div>
    : null;

  const sidebarModules = [
    multiPanel ? { type: "AboutSefaria" } : { type: null },
    { type: "Promo" },
    { type: "Translations" },
    // {type: "LearningSchedules"},
    { type: "JoinTheCommunity" },
    { type: "Resources" },
  ];

  const footer = compare ? null : <Footer />;
  const classes = classNames({ readerNavMenu: 1, compare: compare, noLangToggleInHebrew: 1 });

  return (
    <div className={classes} key="0">
      {comparePanelHeader}
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            {title}
            {about}
            {dedication}
            {languageToggle} {/* Moved here, below dedication */}
            {libraryMessage}
            {categoryListings}
          </div>
          {!compare ? <NavSidebar modules={sidebarModules} /> : null}
        </div>
        {footer}
      </div>
    </div>
  );
};

TextsPage.propTypes = {
  categories: PropTypes.array.isRequired,
  settings: PropTypes.object.isRequired,
  setCategories: PropTypes.func.isRequired,
  openSearch: PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func,
  toggleLanguage: PropTypes.func,
  multiPanel: PropTypes.bool,
  compare: PropTypes.bool,
};

// Dedication component updated to include Chinese dedication options
const Dedication = () => {
  let dedDate = new Date();
  dedDate.setHours(dedDate.getHours() + 6);
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const date = new Date(dedDate - tzoffset).toISOString().substring(0, 10);

  const [dedicationData, setDedicationData] = useState(Sefaria._tableOfContentsDedications[date]);

  function get_google_sheet_data() {
    const url =
      'https://docs.google.com/spreadsheets/d/16WqaFgY3P8wEFttRRbi-Pclo1Urm5jg7sMabl7apS_Y/edit?gid=0#gid=0';
    const query = new google.visualization.Query(url);
    query.setQuery('select A, B, C, D');
    query.send(processSheetsData);
  }

  function processSheetsData(response) {
    const data = response.getDataTable();
    const columns = data.getNumberOfColumns();
    const rows = data.getNumberOfRows();
    for (let r = 0; r < rows; r++) {
      let row = [];
      for (let c = 0; c < columns; c++) {
        row.push(data.getFormattedValue(r, c));
      }
      Sefaria._tableOfContentsDedications[row[0]] = { "en": row[1], "he": row[2], "zh": row[3] };
    }
    setDedicationData(Sefaria._tableOfContentsDedications[date]);
  }

  useEffect(() => {
    if (!dedicationData) {
      google.charts.load('current');
      google.charts.setOnLoadCallback(get_google_sheet_data);
    }
  }, []);

  return (
    dedicationData && (dedicationData.en || dedicationData.he || dedicationData.zh) ?
      <div className="dedication">
        <span>
          {Sefaria.interfaceLang === "english" && <span className="int-en">{dedicationData?.en}</span>}
          {Sefaria.interfaceLang === "hebrew" && <span className="int-he">{dedicationData?.he}</span>}
          {Sefaria.interfaceLang === "chinese" && <span className="int-zh">{dedicationData?.zh}</span>}
        </span>
      </div>
      : null
  );
};

export default TextsPage;