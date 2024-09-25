import React, {memo, useCallback, useEffect, useState} from 'react';
import PropTypes from 'prop-types';
import Sefaria from './sefaria/sefaria';
import {VersionsBlocksList} from './VersionBlock/VersionBlock';
import {EnglishText, HebrewText, InterfaceText, LoadingMessage} from "./Misc";
import {VersionsTextList} from "./VersionsTextList";

const TranslationsBox = ({
  currObjectVersions,
  mode,
  vFilter,
  recentVFilters,
  srefs,
  setConnectionsMode,
  setFilter,
  openVersionInReader,
  onRangeClick,
  onCitationClick,
  translationLanguagePreference
}) => {
  useEffect(() => {
    console.log('Sidebar content is updating');
  });
  const _excludedLangs = ["he"];
  
  const [versionLangMap, setVersionLangMap] = useState(null);
  const [currentVersionsByActualLangs, setCurrentVersionsByActualLangs] = useState(Sefaria.transformVersionObjectsToByActualLanguageKeys(currObjectVersions));

  const isSheet = useCallback(() => {
    return srefs[0].startsWith("Sheet");
  }, [srefs]);

  useEffect(() => {
    if (!isSheet()) {
      Sefaria.getAllTranslationsWithText(srefs[0]).then(onVersionsLoad);
    }
  }, [srefs, isSheet, vFilter, recentVFilters]);

  const onVersionsLoad = useCallback((versions) => {
    let versionsByLang = versions;
    let currentVersionsByActualLangs = Sefaria.transformVersionObjectsToByActualLanguageKeys(currObjectVersions);
    for (let [lang, ver] of Object.entries(currentVersionsByActualLangs)) {
      if (!_excludedLangs.includes(lang)) {
        versionsByLang[lang]?.sort((a, b) => {
          return a.versionTitle === ver.versionTitle ? -1 : b.versionTitle === ver.versionTitle ? 1 : 0;
        });
      }
    }
    setVersionLangMap(versionsByLang);
    setCurrentVersionsByActualLangs(currentVersionsByActualLangs);
  }, [currObjectVersions]);

  const openVersionInSidebar = (versionTitle, versionLanguage) => {
    setConnectionsMode("Translation Open");
    setFilter(Sefaria.getTranslateVersionsKey(versionTitle, versionLanguage));
  };

  if (isSheet()) {
    return (
      <div className="versionsBox">
        <LoadingMessage message="There are no Translations for this sheet source" heMessage="למקור זה אין תרגומים" />
      </div>
    );
  }

  if (mode === "Translation Open") {
    return (
      <VersionsTextList
        srefs={srefs}
        vFilter={vFilter}
        recentVFilters={recentVFilters}
        setFilter={setFilter}
        onRangeClick={onRangeClick}
        setConnectionsMode={setConnectionsMode}
        onCitationClick={onCitationClick}
        translationLanguagePreference={translationLanguagePreference}
      />
    );
  } else if (mode === "Translations") {
    if (!versionLangMap) {
      return (
        <div className="versionsBox">
          <LoadingMessage />
        </div>
      );
    }
    return (
      <>
        <TranslationsHeader />
        <VersionsBlocksList
          versionsByLanguages={versionLangMap}
          currObjectVersions={currObjectVersions}
          sortPrioritizeLanugage={"en"}
          currentRef={srefs[0]}
          openVersionInReader={openVersionInReader}
          openVersionInSidebar={openVersionInSidebar}
          viewExtendedNotes={undefined}
          inTranslationBox={true}
          showNotes={false}
          srefs={srefs}
          onRangeClick={onRangeClick}
        />
      </>
    );
  }
};

TranslationsBox.propTypes = {
  currObjectVersions: PropTypes.object.isRequired,
  mode: PropTypes.oneOf(["Translations", "Translation Open"]),
  vFilter: PropTypes.array,
  recentVFilters: PropTypes.array,
  srefs: PropTypes.array.isRequired,
  setConnectionsMode: PropTypes.func.isRequired,
  setFilter: PropTypes.func.isRequired,
  openVersionInReader: PropTypes.func.isRequired,
  sectionRef: PropTypes.string.isRequired,
  onRangeClick: PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
};

const TranslationsHeader = () => (
  <div className="translationsHeader">
    <h3>
      <InterfaceText>Translations</InterfaceText>
    </h3>
    <div className="translationsDesc sans-serif">
      <InterfaceText>
        <EnglishText>Sefaria acquires translations to enrich your learning experience. Preview or choose a different translation below.</EnglishText>
        <HebrewText>ספריא עושה מאמצים להוסיף תרגומים שונים לספרים כדי להעשיר את חווית הלמידה שלכם. כאן ניתן להחליף לתרגום אחר או לראות תצוגה מקדימה שלו לצד הטקסט הנוכחי.</HebrewText>
      </InterfaceText>
      <a href="/sheets/511573" target="_blank" className="inTextLink">
        <InterfaceText>
          <EnglishText>Learn more ›</EnglishText>
          <HebrewText>למידע נוסף ›</HebrewText>
        </InterfaceText>
      </a>
    </div>
  </div>
);

VersionsTextList.propTypes = {
  srefs: PropTypes.array,
  vFilter: PropTypes.array,
  recentVFilters: PropTypes.array,
  setFilter: PropTypes.func.isRequired,
  onRangeClick: PropTypes.func.isRequired,
  onCitationClick: PropTypes.func.isRequired,
  translationLanguagePreference: PropTypes.string,
  setConnectionsMode: PropTypes.func.isRequired,
};


const translationBoxStateCompare = (prevProps, nextProps) => {
  // Only update if the vFilter, recentVFilters, or srefs have changed
  return nextProps.vFilter.compare(prevProps.vFilter)
  && nextProps.recentVFilters.compare(prevProps.recentVFilters)
  && nextProps.srefs.compare(prevProps.srefs)
};

export default memo(TranslationsBox, translationBoxStateCompare);
