import React, {useContext} from "react";
import PropTypes from "prop-types";
import {ReaderPanelContext} from "./context";
import RadioButton from "./common/RadioButton";
import Sefaria from "./sefaria/sefaria";

function SourceTranslationsButtons({ showPrimary, showTranslation, setShowTexts }) {
    const {panelMode, panelPosition} = useContext(ReaderPanelContext);
    const isSidePanel = !['Text', 'Sheet'].includes(panelMode);
    const createButton = (isPrimary, isTranslation, text) => {
        const isActive = (isPrimary === showPrimary && isTranslation === showTranslation);
        return (<RadioButton
            isActive={isActive}
            onClick={() => setShowTexts(isPrimary, isTranslation)}
            value={text}
            name={`languageOptions${panelPosition}`}
            label={text}
            id={`${text}${panelPosition}`}
        />);
    };

    return (
      <div className="show-source-translation-buttons" role="radiogroup" aria-label={Sefaria._("Source-translation toggle")}>
          {createButton(true, false, 'Source')}
          {createButton(false, true, 'Translation')}
          {!isSidePanel && createButton(true, true, 'Source with Translation')}
      </div>
    );
}
SourceTranslationsButtons.propTypes = {
    showPrimary: PropTypes.bool.isRequired,
    showTranslation: PropTypes.bool.isRequired,
    setShowTexts: PropTypes.func.isRequired,
}
export default SourceTranslationsButtons
