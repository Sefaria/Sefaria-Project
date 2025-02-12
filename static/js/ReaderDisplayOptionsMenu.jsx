import React, {useContext} from "react";
import Sefaria from "./sefaria/sefaria";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ContentLanguageContext} from "./context";
import LayoutButtons from "./LayoutButtons";
import {FontSizeButtons} from "./Misc";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, panelMode, textsData, width} = useContext(ContentLanguageContext);

    const isPanelModeSheet = panelMode === 'Sheet';
    const isSidePanel = !isPanelModeSheet && panelMode !== 'Text';
    const [HEBREW, ENGLISH, BILINGUAL] = ['hebrew', 'english', 'bilingual'];

    const showLangaugeToggle = () => {
      if (Sefaria._siteSettings.TORAH_SPECIFIC) return true;

      const hasHebrew = !!textsData.he.length;
      const hasEnglish = !!textsData.text.length;
      return !(hasHebrew && hasEnglish);
    };
    const showPrimary = language !== ENGLISH;
    const showTranslation = language !== HEBREW;
    const setShowTexts = (showPrimary, showTranslation) => {
        const language = (showPrimary && showTranslation) ? BILINGUAL : (showPrimary) ? HEBREW : ENGLISH;
        setOption('language', language);
    };

    const borderLine = <div className="text-menu-border"/>;

    const showLayoutsToggle = () => {
        return  !((width <= 600 && language === BILINGUAL) ||
            (isPanelModeSheet && language !== BILINGUAL));
    }

    return (
        <div className="texts-properties-menu" role="dialog">
            {showLangaugeToggle() && <>
                <SourceTranslationsButtons
                    showPrimary={showPrimary}
                    showTranslation={showTranslation}
                    setShowTexts={setShowTexts}
                />
                {borderLine}
            </>}
            {!isSidePanel && <>
                {showLayoutsToggle() && <LayoutButtons/>}
                {borderLine}
                <FontSizeButtons/>
            </>}
        </div>
    );
};
ReaderDisplayOptionsMenu.propTypes = {};
export default ReaderDisplayOptionsMenu;