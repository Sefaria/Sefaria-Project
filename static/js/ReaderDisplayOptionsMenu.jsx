import React, {useContext} from "react";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ReaderPanelContext} from "./context";
import LayoutButtons from "./LayoutButtons";
import FontSizeButtons from "./FontSizeButton";
import ToggleSwitchLine from "./components/ToggleSwitchLine";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, isComparePanel, panelMode, aliyotShowStatus, textsData} = useContext(ReaderPanelContext);
    const showLangaugeToggle = () => {
      if (Sefaria._siteSettings.TORAH_SPECIFIC) return true;

      if (!textsData) return true

      const hasHebrew = !!textsData.he.length;
      const hasEnglish = !!textsData.text.length;
      return !(hasHebrew && hasEnglish);
    };
    const showPrimary = language !== 'english';
    const showTranslation = language !== 'hebrew';
    const setShowTexts = (showPrimary, showTranslation) => {
        const language = (showPrimary && showTranslation) ? 'bilingual' : (showPrimary) ? 'hebrew' : 'english';
        setOption('language', language);
    };

    const haAliyot = () => {
        let booksWithAliyot = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"];
        return booksWithAliyot.includes(textsData?.book);
    }
    const showAliyotToggle = () => {
        return haAliyot() && panelMode !== "Sheet";
    }
    const onAliyotChange = () => {
        const newAliyot = (aliyotShowStatus === 'aliyotOn') ? 'aliyotOff' : 'aliyotOn';
        setOption('aliyotTorah', newAliyot)
    }

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
            {showLangaugeToggle() && !isComparePanel && <div className="text-menu-border"/>}
            {!isComparePanel && <>
                <LayoutButtons/>
                {showAliyotToggle() && <ToggleSwitchLine
                    name="aliyot"
                    text="Aliyot"
                    onChange={onAliyotChange}
                    isChecked={aliyotShowStatus === 'aliyotOn'}
                />}
                <div className="text-menu-border"/>
                <FontSizeButtons/>
            </>}
        </div>
    );
};
ReaderDisplayOptionsMenu.propTypes = {
};
export default ReaderDisplayOptionsMenu;
