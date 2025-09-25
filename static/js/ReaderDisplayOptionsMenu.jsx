import React, {useContext, useRef, useEffect} from "react";
import Sefaria from "./sefaria/sefaria";
import PropTypes from "prop-types";
import SourceTranslationsButtons from "./SourceTranslationsButtons";
import {ReaderPanelContext} from "./context";
import LayoutButtons from "./LayoutButtons";
import FontSizeButtons from "./FontSizeButton";
import ToggleSwitchLine from "./common/ToggleSwitchLine";

const ReaderDisplayOptionsMenu = () => {
    const {language, setOption, panelMode, aliyotShowStatus, textsData, vowelsAndCantillationState, punctuationState, width, panelPosition} = useContext(ReaderPanelContext);
    const menuRef = useRef(null);

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

    useEffect(() => {
        // Focus the first focusable element when menu opens
        if (menuRef.current) {
            const firstFocusable = menuRef.current.querySelector('[role="radiogroup"], button, [tabindex="0"]');
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            // Close the menu by clicking outside or triggering close mechanism
            const dropdownMenu = e.target.closest('.readerDropdownMenu');
            if (dropdownMenu) {
                // Simulate click outside to close
                document.body.click();
            }
            return;
        }

        // Prevent arrow keys from closing the menu - let radio buttons handle them
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.stopPropagation();
            // Don't prevent default - let the radio buttons handle arrow navigation
            return;
        }

        if (e.key === 'Tab') {
            // Let default tab behavior handle focus management within the dialog
            const focusableElements = menuRef.current.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
                'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled]), [role="radio"]:not([disabled])'
            );
            
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    };

    return (
        <div 
            className="texts-properties-menu" 
            role="dialog" 
            aria-label={Sefaria._("Text display options")}
            ref={menuRef}
            onKeyDown={handleKeyDown}
            tabIndex="-1"
        >
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
                    name={`aliyot${panelPosition}`}
                    text="Aliyot"
                    onChange={onAliyotClick}
                    isChecked={aliyotAreShown}
                />}
                {borderLine}
                <FontSizeButtons/>
                {borderLine}
                {showVowelsToggle() && <ToggleSwitchLine
                    name={`vowels${panelPosition}`}
                    text="Vowels"
                    onChange={onVowelsClick}
                    isChecked={vowelsAreShown}
                />}
                {showCantillationToggle() && <ToggleSwitchLine
                    name={`cantillation${panelPosition}`}
                    text="Cantillation"
                    disabled={cantillationDisabled}
                    onChange={onCantillationClick}
                    isChecked={cantillationsAreShown}
                />}
                {showPunctuationToggle() && <ToggleSwitchLine
                    name={`punctuation${panelPosition}`}
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
