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
        initialShowSource = true,
        initialShowTranslation = false,
        initialLayoutPreferences = {},
        hasAliyot = false,
        initialShowAliyot = true,
        initialFontSize = 12,
        hasVowels = false,
        initialShowVowels = false,
        hasCantilation = false,
        initialShowCantilation = true,
        hasPunctuation = false,
        initialShowPunctuation = true
    }) {
    const [showSource, setShowSource] = useState(initialShowSource);
    const [showTranslation, setShowTranslation] = useState(initialShowTranslation);
    const setShowTexts = (source, translation) => {
        setShowSource(source);
        setShowTranslation(translation);
    }

    const layoutOptions = getLayoutOptions(sourceDir);
    const [layoutsState, setLayoutsState] = useState(calculateLayoutState(showSource, sourceDir, showTranslation, translationDir));
    useEffect(() => {
      setLayoutsState(calculateLayoutState(showSource, sourceDir, showTranslation, translationDir));
    }, [showSource, showTranslation]);

    const [layoutPreferences, setLayoutPreferences] = useState(initialLayoutPreferences)
    useEffect(() => {
        setLayoutPreferences({
            'mono': layoutPreferences.mono || 'continued',
            'bi': layoutPreferences.bi || 'vertical',
            'mixed': layoutPreferences.mixed
        });
    }, []);
    const [layout, setLayout] = useState('');
    useEffect(() => {
        setLayout(layoutPreferences[layoutsState.replace(/-(?:ltr|rtl)/, '')] || layoutOptions[layoutsState][0]);
    }, [layoutPreferences, layoutsState]);
    const onLayoutChange = (newLayout) => {
        setLayoutPreferences(prevState => ({
            ...prevState,
            [layoutsState]: newLayout
        }))}

    const [fontSize, setFontSize] = useState(initialFontSize);
    const [showAliyot, setShowAliyot] = useState(initialShowAliyot);
    const [showVowels, setShowVowels] = useState(initialShowVowels)
    const [showCantilation, setShowCantilation] = useState(initialShowCantilation);
    const [showPunctuation, setShowPunctuation] = useState(initialShowPunctuation);


    const menu = (
        <div className="texts-properties-menu">
            <SourceTranslationsButtons
                showSource={showSource}
                showTranslation={showTranslation}
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
                onChange={() => setShowAliyot(!showAliyot)}
                isChecked={showAliyot}
            /> }
            <div className="text-menu-border"/>
            <FontSizeButton
                handleEnlarge={ () => {setFontSize(fontSize + 2)} }
                handleReduce={ () => {setFontSize(fontSize - 2)} }
            />
            <div className="text-menu-border"/>
            { hasVowels && <ToggleSwitchLine
                name="vowels"
                text="Vowels"
                disabled={!showSource}
                onChange={() => setShowVowels(!showVowels)}
                isChecked={showVowels}
            /> }
            { hasCantilation && <ToggleSwitchLine
                name="cantilation"
                text="Cantilation"
                disabled={!showSource}
                onChange={() => setShowCantilation(!showCantilation)}
                isChecked={showCantilation}
            /> }
            { hasPunctuation && <ToggleSwitchLine
                name="punctuation"
                text="Punctuation"
                disabled={!showSource}
                onChange={() => setShowPunctuation(!showPunctuation)}
                isChecked={showPunctuation}
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
    initialShowSource: PropTypes.bool,
    initialShowTranslation: PropTypes.bool,
    initialLayoutPreferences: PropTypes.object,
    hasAliyot: PropTypes.bool,
    initialShowAliyot: PropTypes.bool,
    initialFontSize: PropTypes.number,
    hasVowels: PropTypes.bool,
    initialShowVowels: PropTypes.bool,
    hasCantilation: PropTypes.bool,
    initialShowCantilation: PropTypes.bool,
    hasPunctuation: PropTypes.bool,
    initialShowPunctuation: PropTypes.bool,
};
export default TextsPropertiesMenu;
