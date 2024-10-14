import React, {useContext} from "react";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ReaderPanelContext} from "./context";
import LayoutButtons from "./LayoutButtons";
import FontSizeButtons from "./FontSizeButton";
import ToggleSwitchLine from "./components/ToggleSwitchLine";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, panelMode, aliyotShowStatus, textsData, vowelsAndCantillationState, punctuationState, width} = useContext(ReaderPanelContext);

    const isSidePanel = !['Text', 'Sheet'].includes(panelMode);
    const showLangaugeToggle = () => {
      if (panelMode === 'Sheet') { return false; }
      if (Sefaria._siteSettings.TORAH_SPECIFIC) return true;

      if (!textsData) return true;

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

    const borderLine = <div className="text-menu-border"/>;

    const showLayoutsToggle = () => {
        if ((panelMode === 'Sheet' && Sefaria.interfaceLang === 'hebrew') || //sheets in hebrew interface are hebrew
        (width <= 600 && language !== 'bilingual')) { //no loyout for mobile biilingual
            return false;
        }
        return true;
    }

    const hasAliyot = () => {
        let booksWithAliyot = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"];
        return booksWithAliyot.includes(textsData?.book);
    };
    const showAliyotToggle = () => {
        return hasAliyot() && panelMode !== "Sheet";
    };
    const aliyotAreShown = aliyotShowStatus === 'aliyotOn';
    const onAliyotClick = () => {
        const newValue = (aliyotAreShown) ? 'aliyotOff' : 'aliyotOn';
        setOption('aliyotTorah', newValue)
    };

    const sampleHas = (regex, textOrHe) => {
        let sample = textsData?.[textOrHe];
        while (Array.isArray(sample)) {
            sample = sample[0];
        }
        return regex.test(sample);
    }
    const showVowelsToggle = () => {
        const vowels_re = /[\u05b0-\u05c3\u05c7]/g;
        return (showPrimary && sampleHas(vowels_re, 'he')) || (showTranslation && sampleHas(vowels_re, 'text'));
    };
    const vowelsAreShown = vowelsAndCantillationState !== 'none';
    const onVowelsClick = () => {
        const newVaue = (vowelsAreShown) ? 'none' : 'partial';
        setOption('vowels', newVaue);
    };

    const showCantillationToggle = () => {
        const cantillation_re = /[\u0591-\u05af]/g;
        return (showPrimary && sampleHas(cantillation_re, 'he')) || (showTranslation && sampleHas(cantillation_re, 'text'));
    };
    const cantillationDisabled = !vowelsAreShown;
    const cantillationsAreShown = vowelsAndCantillationState === 'all';
    const onCantillationClick = () => {
        const newValue = (cantillationsAreShown) ? 'partial' : 'all';
        setOption('vowels', newValue)
    };

    const showPunctuationToggle = () => {
        return  textsData?.primary_category === "Talmud" && showPrimary;
    };
    const punctuationsAreShown = punctuationState === 'punctuationOn';
    const onPunctuationClick = () => {
        const newValue = (punctuationsAreShown) ? 'punctuationOff' : 'punctuationOn';
        setOption('punctuationTalmud', newValue);
    };

    return (
        <div className="texts-properties-menu">
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
                {showAliyotToggle() && <ToggleSwitchLine
                    name="aliyot"
                    text="Aliyot"
                    onChange={onAliyotClick}
                    isChecked={aliyotAreShown}
                />}
                {borderLine}
                <FontSizeButtons/>
                {borderLine}
                {showVowelsToggle() && <ToggleSwitchLine
                    name="vowels"
                    text="Vowels"
                    onChange={onVowelsClick}
                    isChecked={vowelsAreShown}
                />}
                {showCantillationToggle() && <ToggleSwitchLine
                    name="cantilation"
                    text="Cantilation"
                    disabled={cantillationDisabled}
                    onChange={onCantillationClick}
                    isChecked={cantillationsAreShown}
                />}
                {showPunctuationToggle() && <ToggleSwitchLine
                    name="punctuation"
                    text="Punctuation"
                    onChange={onPunctuationClick}
                    isChecked={punctuationsAreShown}
                />}
            </>}
        </div>
    );
};
ReaderDisplayOptionsMenu.propTypes = {
};
export default ReaderDisplayOptionsMenu;
