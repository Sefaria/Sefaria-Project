import React from "react";
import PropTypes from "prop-types";
import ToggleSwitch from "./ToggleSwitch";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";

function ToggleSwitchLine(props) {
    const isHebrew = Sefaria.interfaceLang === "hebrew";
    const isDisabled = props.disabled;
    return (
        <div className={`toggle-switch-line ${isDisabled ? 'disabled' : ''}`}>
            {!isHebrew && <InterfaceText>{props.text}</InterfaceText>}
            <ToggleSwitch
                name={props.name}
                id={props.name}
                disabled={isDisabled}
            />
            {isHebrew && <InterfaceText>{props.text}</InterfaceText>}
        </div>
    );
}
ToggleSwitchLine.prototypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    text: PropTypes.string,
};
export default ToggleSwitchLine;
