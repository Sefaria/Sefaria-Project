import React, {useContext} from "react";
import PropTypes from "prop-types";
import {ContentLanguageContext} from "./context";
import {RadioButton} from "./Misc";
import Sefaria from './sefaria/sefaria';

function SourceTranslationsButtons({ showPrimary, showTranslation, setShowTexts }) {
    const {panelMode} = useContext(ContentLanguageContext);
    const isSidePanel = !['Text', 'Sheet'].includes(panelMode);
    const createButton = (isPrimary, isTranslation, text) => {
        const isActive = (isPrimary === showPrimary && isTranslation === showTranslation);
        return (<RadioButton
            isActive={isActive}
            onClick={() => setShowTexts(isPrimary, isTranslation)}
            value={text}
            name='languageOptions'
            label={text}
        />);
    };

    return (
      <div className="show-source-translation-buttons" aria-label="Source-translation toggle">
          {createButton(true, false, Sefaria._('text.reader_option_menu.source'))}
          {createButton(false, true, Sefaria._('text.reader_option_menu.translation'))}
          {!isSidePanel && createButton(true, true, Sefaria._('text.reader_option_menu.source_with_translation'))}
      </div>
    );
}
SourceTranslationsButtons.propTypes = {
    showPrimary: PropTypes.bool.isRequired,
    showTranslation: PropTypes.bool.isRequired,
    setShowTexts: PropTypes.func.isRequired,
}
export default SourceTranslationsButtons