import React from "react";
import PropTypes from "prop-types";
import ToggleSwitch from "./ToggleSwitch";
import {InterfaceText} from "../Misc";

function ToggleSwitchLine({name, onChange, isChecked, text, disabled=false}) {
    return (
        <div className={`toggle-switch-line ${disabled ? 'disabled' : ''}`} data-prevent-close="true">
            <label htmlFor={name} id={`${name}-label`}>
                <InterfaceText>{text}</InterfaceText>
            </label>
            <ToggleSwitch
                name={name}
                disabled={disabled}
                onChange={onChange}
                isChecked={isChecked}
            />
        </div>
    );
}
ToggleSwitchLine.propTypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    text: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    isChecked: PropTypes.bool.isRequired,
};
export default ToggleSwitchLine;
