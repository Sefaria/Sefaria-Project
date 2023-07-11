import React from "react";
import PropTypes from "prop-types";
import ToggleSwitch from "./ToggleSwitch";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";

function ToggleSwitchLine({name, onChange, isChecked, text, disabled=false}) {
    return (
        <div className={`toggle-switch-line ${disabled ? 'disabled' : ''}`}>
            <InterfaceText>{text}</InterfaceText>
            <ToggleSwitch
                name={name}
                id={name}
                disabled={disabled}
                onChange={onChange}
                isChecked={isChecked}
            />
        </div>
    );
}
ToggleSwitchLine.prototypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    text: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    isChecked: PropTypes.bool.isRequired,
};
export default ToggleSwitchLine;
