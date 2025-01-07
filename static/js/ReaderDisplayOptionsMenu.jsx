import React, {useContext} from "react";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ReaderPanelContext} from "./context";
import LayoutButtons from "./LayoutButtons";
import FontSizeButtons from "./FontSizeButton";
import ToggleSwitchLine from "./common/ToggleSwitchLine";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, panelMode, aliyotShowStatus, textsData, vowelsAndCantillationState, punctuationState, width} = useContext(ReaderPanelContext);

    const isPanelModeSheet = panelMode === 'Sheet';
    const isSidePanel = !isPanelModeSheet && panelMode !== 'Text';
    const [HEBREW, ENGLISH, BILINGUAL] = ['hebrew', 'english', 'bilingual'];

    const showLangaugeToggle = () => {
      if (isPanelModeSheet) { return false; }
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
        return !((isPanelModeSheet && Sefaria.interfaceLang === HEBREW) || //sheets in hebrew interface are hebrew
            (width <= 600 && language === BILINGUAL));
    }

    const hasAliyot = () => {
        let booksWithAliyot = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Onkelos Genesis", "Onkelos Exodus", "Onkelos Leviticus", "Onkelos Numbers", "Onkelos Deuteronomy"];
        return booksWithAliyot.includes(textsData?.book);
    };
    const showAliyotToggle = () => {
        return hasAliyot() && !isPanelModeSheet;
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

    const [HE, TEXT, PARTIAL, ALL, NONE] = ['he', 'text', 'partial', 'all', 'none'];
    const showVowelsToggle = () => {
        const vowels_re = /[\u05b0-\u05c3\u05c7]/g;
        return (showPrimary && sampleHas(vowels_re, HE)) || (showTranslation && sampleHas(vowels_re, TEXT));
    };
    const vowelsAreShown = vowelsAndCantillationState !== NONE;
    const onVowelsClick = () => {
        const newVaue = (vowelsAreShown) ? NONE : PARTIAL;
        setOption('vowels', newVaue);
    };

    const showCantillationToggle = () => {
        const cantillation_re = /[\u0591-\u05af]/g;
        return (showPrimary && sampleHas(cantillation_re, HE)) || (showTranslation && sampleHas(cantillation_re, TEXT));
    };
    const cantillationDisabled = !vowelsAreShown;
    const cantillationsAreShown = vowelsAndCantillationState === ALL;
    const onCantillationClick = () => {
        const newValue = (cantillationsAreShown) ? PARTIAL : ALL;
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
