import React, {useContext} from "react";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ReaderPanelContext} from "./context";
import LayoutButtons from "./LayoutButtons";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, isComparePanel} = useContext(ReaderPanelContext);
    const showLangaugeToggle = () => {
      if (Sefaria._siteSettings.TORAH_SPECIFIC) return true;

      let data = this.props.data;
      if (!data) return true // Sheets don't have currentData, also show for now (4x todo)

      const hasHebrew = !!data.he.length;
      const hasEnglish = !!data.text.length;
      return !(hasHebrew && hasEnglish);
    };
    const showPrimary = language !== 'english';
    const showTranslation = language !== 'hebrew';
    const setShowTexts = (showPrimary, showTranslation) => {
        const language = (showPrimary && showTranslation) ? 'bilingual' : (showPrimary) ? 'hebrew' : 'english';
        setOption('language', language);
    };

    return (
        <div className="texts-properties-menu">
            {showLangaugeToggle() && <>
                <SourceTranslationsButtons
                    showPrimary={showPrimary}
                    showTranslation={showTranslation}
                    setShowTexts={setShowTexts}
                />
                <div className="text-menu-border"/>
            </>}
            {!isComparePanel && <LayoutButtons/>}
        </div>
    );
};
ReaderDisplayOptionsMenu.propTypes = {
};
export default ReaderDisplayOptionsMenu;
