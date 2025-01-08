import React, {useCallback, useContext} from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";

function SourceTranslationsButtons({ showPrimary, showTranslation, setShowTexts }) {
    const {panelMode} = useContext(ReaderPanelContext);
    const isSidePanel = !['Text', 'Sheet'].includes(panelMode);
    const createButton = useCallback((isPrimary, isTranslation, text) => {
        const isActive = (isPrimary === showPrimary && isTranslation === showTranslation);
        return (
            <div
                className={`button ${(isActive) ? "checked" : ""}`}
                onClick={ () => setShowTexts(isPrimary, isTranslation) }
            >
                <InterfaceText>{text}</InterfaceText>
            </div>
        );
    }, [showPrimary, showTranslation]);
    return (
      <div className="show-source-translation-buttons">
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
