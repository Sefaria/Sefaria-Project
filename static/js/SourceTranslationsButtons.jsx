import React, {useCallback, useContext} from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "./Misc";
import {ReaderPanelContext} from "./context";
import RadioButton from "./common/RadioButton";

function SourceTranslationsButtons({ showPrimary, showTranslation, setShowTexts }) {
    const {panelMode} = useContext(ReaderPanelContext);
    const isSidePanel = !['Text', 'Sheet'].includes(panelMode);
    const createButton = useCallback((isPrimary, isTranslation, text) => {
        const isActive = (isPrimary === showPrimary && isTranslation === showTranslation);
        return (<RadioButton
            isActive={isActive}
            onClick={() => setShowTexts(isPrimary, isTranslation)}
            value={text}
            name='languageOptions'
            label={text}
        />);
    }, [showPrimary, showTranslation]);

    return (
      <div className="show-source-translation-buttons" role="radiogroup" aria-label="Source-translation toggle">
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
