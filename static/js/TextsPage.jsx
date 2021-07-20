import React, { useState, useEffect, useRef } from 'react';
import PropTypes  from 'prop-types';
import classNames  from 'classnames';
import Sefaria  from './sefaria/sefaria';
import $  from './sefaria/sefariaJquery';
import { NavSidebar, Modules } from './NavSidebar';
import TextCategoryPage  from './TextCategoryPage';
import Footer  from './Footer';
import ComparePanelHeader from './ComparePanelHeader';
import {
  TextBlockLink,
  TwoOrThreeBox,
  NBox,
  ResponsiveNBox,
  LanguageToggleButton,
  InterfaceText, 
  ContentText,
} from './Misc';


const TextsPage = ({categories, settings, setCategories, onCompareBack, openSearch,
  toggleLanguage, openTextTOC, openDisplaySettings, multiPanel, initialWidth, compare}) => {

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
  let categoryListings = Sefaria.toc.map(cat => {
    const style = {"borderColor": Sefaria.palette.categoryColor(cat.category)};
    const openCat = e => {e.preventDefault(); setCategories([cat.category])};

    return (
      <div className="navBlock withColorLine" style={style}>
        <a href={`/texts/${cat.category}`} className="navBlockTitle" data-cat={cat.category} onClick={openCat}>
          <ContentText text={{en: cat.category, he: cat.heCategory}} defaultToInterfaceOnBilingual={true} />
        </a>
        <div className="navBlockDescription">
          <ContentText text={{en: cat.enShortDesc, he: cat.heShortDesc}} defaultToInterfaceOnBilingual={true} />
        </div>
      </div>
    );
  });
  
  categoryListings = (
    <div className="readerNavCategories">
      <ResponsiveNBox content={categoryListings} initialWidth={initialWidth} />
    </div>);

  const comparePanelHeader = compare ? 
    <ComparePanelHeader
      search={true}
      onBack={onCompareBack}
      openDisplaySettings={openDisplaySettings}
      openSearch={openSearch}
    /> : null;

  const title = compare ? null : 
    <div className="navTitle tight sans-serif">
      <h1><InterfaceText>Browse the Library</InterfaceText></h1>

      { multiPanel && Sefaria.interfaceLang !== "hebrew" && Sefaria._siteSettings.TORAH_SPECIFIC ?
      <LanguageToggleButton toggleLanguage={toggleLanguage} /> : null }
    </div>

  const about = compare || multiPanel ? null :
    <Modules type={"AboutSefaria"} props={{hideTitle: true}}/>;

  const dedication = Sefaria._siteSettings.TORAH_SPECIFIC && !compare ? <Dedication /> : null;

  const libraryMessage = Sefaria._siteSettings.LIBRARY_MESSAGE && !compare ? 
    <div className="libraryMessage" dangerouslySetInnerHTML={ {__html: Sefaria._siteSettings.LIBRARY_MESSAGE} }></div>
    : null;

  const sidebarModules = [
    multiPanel ? {type: "AboutSefaria"} : {type: null},
    {type: "LearningSchedules"},
    {type: "JoinTheCommunity"},
    {type: "Resources"},
  ];

  const footer = compare ? null : <Footer />;
  const classes = classNames({readerNavMenu:1, compare: compare, noLangToggleInHebrew: 1 });

  return (
    <div className={classes} key="0">
      {comparePanelHeader}
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            { title }
            { about }
            { dedication }
            { libraryMessage }
            { categoryListings }
          </div>
          {!compare ? <NavSidebar modules={sidebarModules} /> : null}
        </div>
        {footer}
      </div>
    </div>
  );
};
TextsPage.propTypes = {
  categories:          PropTypes.array.isRequired,
  settings:            PropTypes.object.isRequired,
  setCategories:       PropTypes.func.isRequired,
  openSearch:          PropTypes.func.isRequired,
  openDisplaySettings: PropTypes.func,
  toggleLanguage:      PropTypes.func,
  multiPanel:          PropTypes.bool,
  compare:             PropTypes.bool,
};


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
        dedicationData && dedicationData.en && dedicationData.he ?
        <div className="dedication">
          <span>
              <span className="int-en">{dedicationData.en}</span>
              <span className="int-he">{dedicationData.he}</span>
          </span>
        </div>
        : null
    );
};


export default TextsPage;