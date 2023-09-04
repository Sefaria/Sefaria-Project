import React, {useCallback} from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "./Misc";

function SourceTranslationsButtons({ showSource, showTranslation, setShowTexts }) {
    const createButton = useCallback((isSource, isTranslation, text) => {
        const isActive = (isSource === showSource && isTranslation === showTranslation);
        return (
            <div
                className={`button ${(isActive) ? "checked" : ""}`}
                onClick={ () => setShowTexts(isSource, isTranslation) }
            >
                <InterfaceText>{text}</InterfaceText>
            </div>
        );
    }, [showSource, showTranslation]);
    return (
      <div className="show-source-translation-buttons">
          {createButton(true, false, 'Source')}
          {createButton(false, true, 'Translation')}
          {createButton(true, true, 'Source with Translation')}
      </div>
    );
}
SourceTranslationsButtons.propTypes = {
    showSource: PropTypes.bool.isRequired,
    showTranslation: PropTypes.bool.isRequired,
    setShowTexts: PropTypes.func.isRequired,
}
export default SourceTranslationsButtons
