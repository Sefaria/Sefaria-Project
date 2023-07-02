import React from "react";
import PropTypes from "prop-types";
import ToggleSwitch from "./ToggleSwitch";
import {InterfaceText} from "../Misc";
import Sefaria from "../sefaria/sefaria";

function ToggleSwitchLine(props) {
    const isDisabled = props.disabled || false;
    return (
        <div className={`toggle-switch-line ${isDisabled ? 'disabled' : ''}`}>
            <InterfaceText>{props.text}</InterfaceText>
            <ToggleSwitch
                name={props.name}
                id={props.name}
                disabled={isDisabled}
                onChange={props.onChange}
                isChecked={props.isChecked}
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
