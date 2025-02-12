import React  from 'react';
import {useContext} from "react";
import { ContentLanguageContext } from "./context";
import {InterfaceText, RadioButton, layoutOptions, layoutLabels} from "./Misc";
import PropTypes from "prop-types";

const calculateLayoutState = (language, textsData, panelMode) => {
    const primaryDir = textsData?.primaryDirection;
    const translationDir = textsData?.translationDirection;
    return (language !== 'bilingual') ? 'mono' //one text
        : (primaryDir == translationDir || panelMode === 'Sheet') ? 'mixed' //two texts with different directions
            : (primaryDir === 'rtl') ? 'bi-rtl' //two rtl texts
                : 'bi-ltr'; //two ltr texts
};

const getPath = (layoutOption, layoutState, textsData) => {
    if (layoutState === 'mixed') {
        const primaryDirection = textsData?.primaryDirection || 'rtl'; //no primary is the case of sheet
        const translationDirection = textsData?.translationDirection || primaryDirection.split('').reverse().join(''); //when there is an empty translation it has no direction. we will show the button as opposite layouts.
        const directions = (layoutOption === 'heLeft') ? `${primaryDirection}${translationDirection}`  //heLeft means primary in left
            : `${translationDirection}${primaryDirection}`;
        if (layoutOption !== 'stacked') {
            layoutOption = 'beside';
        }
        layoutOption = `${layoutOption}-${directions}`;
    }
    return `/static/icons/${layoutState}-${layoutOption}.svg`;
};

const LayoutButton = ({layoutOption, layoutState}) => {
    const {language, textsData, setOption, layout} = useContext(ContentLanguageContext);
    const path = getPath(layoutOption, layoutState, textsData);
    const optionName = (language === 'bilingual') ? 'biLayout' : 'layout';
    const checked = layout === layoutOption;
    return (
        <div className='layout-button focus-visible' key={layoutOption}>
            <RadioButton
                onClick={() => setOption(optionName, layoutOption)}
                name='layout-options'
                isActive={checked}
                value={layoutOption}
                style={{"--url": `url(${path})`}}
            />
        </div>
    );
};
LayoutButton.propTypes = {
    layoutOption: PropTypes.string.isRequired,
    layoutState: PropTypes.string.isRequired,
};

const LayoutButtons = () => {
    const {language, textsData, panelMode} = useContext(ContentLanguageContext);
    const layoutState = calculateLayoutState(language, textsData, panelMode);
    return (
        <div className="layout-button-line" role="radiogroup" aria-label="text layout toggle">
            <InterfaceText>text.reader_option_menu.layout</InterfaceText>
            <div className="layout-options">
                {layoutOptions[layoutState].map((option, index) => <LayoutButton
                    key={index}
                    layoutOption={option}
                    layoutState={layoutState}
                />)}
            </div>
        </div>
    );
};

export default LayoutButtons;