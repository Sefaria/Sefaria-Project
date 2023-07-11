import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import ToggleSwitchLine from "./components/ToggleSwitchLine";
import LayoutButtonLine from './LayoutButtonLine'
import FontSizeButton from "./FontSizeButton";
import {getLayoutOptions} from './constants';
import PopoverMenu from "./components/PopoverMenu";
import SourceTranslationsButtons from "./SourceTranslationsButtons";

const calculateLayoutState = (showSource, sourceDir, showTranslation, translationDir) => {
    return (!showSource || !showTranslation) ? 'mono' //one text
        : (sourceDir !== translationDir) ? 'mixed' //two texts with different directions
            : (sourceDir === 'rtl') ? 'bi-rtl' //two rtl texts
                : 'bi-ltr'; //two ltr texts
}

function TextsPropertiesMenu({
        sourceDir,
        translationDir,
        showSource = true,
        showTranslation = false,
        layoutPreferences = {},
        hasAliyot = false,
        showAliyot = true,
        fontSize = 12,
        hasVowels = false,
        showVowels = false,
        hasCantilation = false,
        showCantilation = true,
        hasPunctuation = false,
        showPunctuation = true
    }) {
    const [showSourceState, setShowSourceState] = useState(showSource);
    const [showTranslationState, setShowTranslationState] = useState(showTranslation);
    const setShowTexts = (source, translation) => {
        setShowSourceState(source);
        setShowTranslationState(translation);
    }

    const layoutOptions = getLayoutOptions(sourceDir);
    const [layoutsState, setLayoutsState] = useState(calculateLayoutState(showSourceState, sourceDir, showTranslationState, translationDir));
    useEffect(() => {
      setLayoutsState(calculateLayoutState(showSourceState, sourceDir, showTranslationState, translationDir));
    }, [showSourceState, showTranslationState]);

    const [layoutPreferencesState, setLayoutPreferencesState] = useState(layoutPreferences)
    useEffect(() => {
        setLayoutPreferencesState({
            'mono': layoutPreferencesState.mono || 'continued',
            'bi': layoutPreferencesState.bi || 'vertical',
            'mixed': layoutPreferencesState.mixed
        });
    }, []);
    const [layout, setLayout] = useState('');
    useEffect(() => {
        setLayout(layoutPreferencesState[layoutsState.replace(/-(?:ltr|rtl)/, '')] || layoutOptions[layoutsState][0]);
    }, [layoutPreferencesState, layoutsState]);
    const onLayoutChange = (newLayout) => {
        setLayoutPreferencesState(prevState => ({
            ...prevState,
            [layoutsState]: newLayout
        }))}

    const [fontSizeState, setFontSizeState] = useState(fontSize);
    const [showAliyotState, setShowAliyotState] = useState(showAliyot);
    const [showVowelsState, setShowVowelsState] = useState(showVowels)
    const [showCantilationState, setShowCantilationState] = useState(showCantilation);
    const [showPunctuationState, setShowPunctuationState] = useState(showPunctuation);


    const menu = (
        <div className="texts-properties-menu">
            <SourceTranslationsButtons
                showSource={showSourceState}
                showTranslation={showTranslationState}
                setShowTexts={setShowTexts}
            />
            <div className="text-menu-border"/>
           <LayoutButtonLine
                layoutState={layoutsState}
                layout={layout}
                onClick={onLayoutChange}
                sourceDir={sourceDir}
            />
            { hasAliyot && <ToggleSwitchLine
                name="aliyot"
                text="Aliyot"
                onChange={() => setShowAliyotState(!showAliyotState)}
                isChecked={showAliyotState}
            /> }
            <div className="text-menu-border"/>
            <FontSizeButton
                handleEnlarge={ () => {setFontSizeState(fontSizeState + 2)} }
                handleReduce={ () => {setFontSizeState(fontSizeState - 2)} }
            />
            <div className="text-menu-border"/>
            { hasVowels && <ToggleSwitchLine
                name="vowels"
                text="Vowels"
                disabled={!showSourceState}
                onChange={() => setShowVowelsState(!showVowelsState)}
                isChecked={showVowelsState}
            /> }
            { hasCantilation && <ToggleSwitchLine
                name="cantilation"
                text="Cantilation"
                disabled={!showSourceState}
                onChange={() => setShowCantilationState(!showCantilationState)}
                isChecked={showCantilationState}
            /> }
            { hasPunctuation && <ToggleSwitchLine
                name="punctuation"
                text="Punctuation"
                disabled={!showSourceState}
                onChange={() => setShowPunctuationState(!showPunctuationState)}
                isChecked={showPunctuationState}
            /> }
        </div>
    );

    const menuImg = (Sefaria.interfaceLang === 'hebrew') ? 'alef' : 'a';
    const button = (
        <img src={`/static/icons/${menuImg}.svg`} alt="Text properties menu" />
    );

    return <PopoverMenu button={button} menu={menu} />;
}

TextsPropertiesMenu.propTypes = {
    sourceDir: PropTypes.string.isRequired,
    translationDir: PropTypes.string.isRequired,
    showSource: PropTypes.bool,
    showTranslation: PropTypes.bool,
    layoutPreferences: PropTypes.object,
    hasAliyot: PropTypes.bool,
    showAliyot: PropTypes.bool,
    fontSize: PropTypes.number,
    hasVowels: PropTypes.bool,
    showVowels: PropTypes.bool,
    hasCantilation: PropTypes.bool,
    showCantilation: PropTypes.bool,
    hasPunctuation: PropTypes.bool,
    showPunctuation: PropTypes.bool,
};
export default TextsPropertiesMenu;
