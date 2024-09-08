import {useContext} from "react";
import {ReaderPanelContext} from "./context";
import {layoutOptions} from "./constants";
import {InterfaceText} from "./Misc";

const calculateLayoutState = (language, primaryDir, translationDir) => {
    return (language !== 'bilingual') ? 'mono' //one text
        : (primaryDir !== translationDir) ? 'mixed' //two texts with different directions
            : (primaryDir === 'rtl') ? 'bi-rtl' //two rtl texts
                : 'bi-ltr'; //two ltr texts
}

const LayoutButtons = () => {
    const {language, textsData, setOption, layout} = useContext(ReaderPanelContext);
    const layoutState = calculateLayoutState(language, textsData?.primaryDirection, textsData?.translationDirection);

    const getPath = (layoutOption) => {
        if (layoutState === 'mixed') {
            const translationDirection = textsData?.translationDirection || textsData?.primaryDirection.split('').reverse().join(''); //when there is an empty translation it has no direction. we will show the button as opposite layouts.
            const directions = (layoutOption === 'heLeft') ? `${textsData?.primaryDirection}${translationDirection}`  //heLeft means primary in left
                : `${translationDirection}${textsData?.primaryDirection}`;
            if (layoutOption !== 'stacked') {
                layoutOption = 'beside';
            }
            layoutOption = `${layoutOption}-${directions}`;
        }
        return `/static/icons/${layoutState}-${layoutOption}.svg`;
    }
    const layoutButton = (layoutOption) => {
        const path = getPath(layoutOption)
        const optionName = (language === 'bilingual') ? 'biLayout' : 'layout';
        return (
            <button
                key={layoutOption}
                className={`layout-button ${layout === layoutOption ? 'checked' : ''}`}
                onClick={() => setOption(optionName, layoutOption)}
                style={{"--url": `url(${path})`}}
            />
        );
    };

    return (
        <div className="layout-button-line">
            <InterfaceText>Layout</InterfaceText>
            <div className="layout-options">
                {layoutOptions[layoutState].map(option => layoutButton(option))}
            </div>
        </div>
    );
}

export default LayoutButtons;
