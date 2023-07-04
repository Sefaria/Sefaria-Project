import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import ToggleSwitchLine from "./components/ToggleSwitchLine";
import LayoutButtonLine from './LayoutButtonLine'
import FontSizeButton from "./FontSizeButton";
import {getLayoutOptions} from './constants';
import PopoverMenu from "./components/PopoverMenu";
import SourceTranslationsButtons from "./SourceTranslationsButtons";

function TextsPropertiesMenu(props) {
    const sourceDir = props.sourceDir;
    const translationDir = props.translationDir;
    const [showSource, setShowSource] = useState(props.showSource === undefined || props.showSource);
    const [showTranslation, setShowTranslation] = useState(props.showTranslation || false);
    const setShowTexts = (source, translation) => {
        setShowSource(source);
        setShowTranslation(translation);
    }

    const layoutOptions = getLayoutOptions(sourceDir);
    const calculateLayoutState = (showSource, sourceDir, showTranslation, translationDir) => {
        return (!showSource || !showTranslation) ? 'mono'
            : (sourceDir !== translationDir) ? 'mixed'
                : (sourceDir === 'rtl') ? 'bi-rtl'
                    : 'bi-ltr';
    }
    const [layoutsState, setLayoutsState] = useState(calculateLayoutState(showSource, sourceDir, showTranslation, translationDir));
    useEffect(() => {
      setLayoutsState(calculateLayoutState(showSource, sourceDir, showTranslation, translationDir));
    }, [showSource, showTranslation]);

    const [layoutPreferences, setLayoutPreferences] = useState(props.layoutPreferences || {})
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

    const [fontSize, setFontSize] = useState(props.fontSize || 12);
    const hasAliyot = props.hasAliyot || false;
    const [showAliyot, setShowAliyot] = useState(props.showAliyot || false);
    const hasVowels = props.hasVowels || false;
    const [showVowels, setShowVowels] = useState(props.showVowels || true)
    const hasCantilation = props.hasCantilation || false;
    const [showCantilation, setShowCantilation] = useState(props.showCantilation || true);
    const hasPunctuation = props.hasPunctuation || false;
    const [showPunctuation, setShowPunctuation] = useState(props.showPunctuation || true);


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
                onClick={ (newLayout) => {
                    setLayoutPreferences(prevState => ({
                        ...prevState,
                        [layoutsState]: newLayout
                    }))} }
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
        <img src={`/static/icons/${menuImg}.svg`} />
    );

    return <PopoverMenu button={button} menu={menu} />;
}

TextsPropertiesMenu.proptypes = {
    sourceDir: PropTypes.string.isRequired,
    translationDir: PropTypes.string.isRequired,
    showSource: PropTypes.bool,
    showTranslation: PropTypes.bool,
    layoutPreferences: PropTypes.object,
    hasAliyot: PropTypes.bool,
    showAliyot: PropTypes.bool,
    fontsize: PropTypes.number,
    hasVowels: PropTypes.bool,
    showVowels: PropTypes.bool,
    hasCantilation: PropTypes.bool,
    showCantilation: PropTypes.bool,
    hasPunctuation: PropTypes.bool,
    showPunctuation: PropTypes.bool,
};
export default TextsPropertiesMenu;
