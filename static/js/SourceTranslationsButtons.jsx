import React from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "./Misc";

function SourceTranslationsButtons(props) {
    const showSource = props.showSource;
    const showTranslation = props.showTranslation;
    const setShowTexts = props.setShowTexts;
    return (
      <div className="show-source-translation-buttons">
          <div className={`button ${(showSource && !showTranslation) ? "checked" : ""}`} onClick={ () => setShowTexts(true, false) } >
              <InterfaceText>Source</InterfaceText>
          </div>
          <div className={`button ${(!showSource && showTranslation) ? "checked" : ""}`} onClick={ () => setShowTexts(false, true) } >
              <InterfaceText>Translation</InterfaceText>
          </div>
          <div className={`button ${(showSource && showTranslation) ? "checked" : ""}`} onClick={ () => setShowTexts(true, true) } >
              <InterfaceText>Source with Translation</InterfaceText>
          </div>
      </div>
    );
}
SourceTranslationsButtons.prototypes = {
    showSource: PropTypes.bool.isRequired,
    showTranslation: PropTypes.bool.isRequired,
    setShowTexts: PropTypes.func.isRequired,
}
export default SourceTranslationsButtons
