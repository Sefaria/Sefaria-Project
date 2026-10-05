import React, {useContext} from "react";
import PropTypes from "prop-types";
import {ReaderPanelContext} from "./context";
import RadioButton from "./common/RadioButton";
import Sefaria from "./sefaria/sefaria";

// Siddur Mode / Learning Mode toggle for the display options menu, with the same markup as the
// Source / Translation toggle (SourceTranslationsButtons).
const MODES = [
    {mode: "siddur", value: "Siddur Mode", label: "siddur_nusach.siddur_mode"},
    {mode: "learning", value: "Learning Mode", label: "siddur_nusach.learning_mode"},
];

function SiddurModeButtons({siddurMode, setSiddurMode}) {
    const {panelPosition} = useContext(ReaderPanelContext);
    return (
        <div className="show-source-translation-buttons siddur-mode-buttons" role="radiogroup" aria-label={Sefaria._("siddur_nusach.mode_toggle")}>
            {MODES.map(({mode, value, label}) => (
                <RadioButton
                    key={mode}
                    isActive={siddurMode === mode}
                    onClick={() => setSiddurMode(mode)}
                    value={value}
                    name={`siddurModeOptions${panelPosition}`}
                    label={label}
                    id={`${mode}Mode${panelPosition}`}
                />
            ))}
        </div>
    );
}
SiddurModeButtons.propTypes = {
    siddurMode: PropTypes.oneOf(["siddur", "learning"]).isRequired,
    setSiddurMode: PropTypes.func.isRequired,
};
export default SiddurModeButtons;
