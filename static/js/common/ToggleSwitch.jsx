import React from "react";
import PropTypes from "prop-types";

function ToggleSwitch({name, disabled, onChange, isChecked}) {
    return (
        <div className="toggle-switch-container">
          <div className="toggle-switch">
            <input
                type="checkbox"
                className="toggle-switch-checkbox"
                name={name}
                id={name}
                disabled={disabled}
                onChange={onChange}
                checked={isChecked && !disabled}
            />
            <label className="toggle-switch-label" htmlFor={name}>
              <span className="toggle-switch-inner" />
              <span className="toggle-switch-switch" />
            </label>
          </div>
        </div>
    );
}
ToggleSwitch.propTypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    onChange: PropTypes.func.isRequired,
    isChecked: PropTypes.bool.isRequired,
};
export default ToggleSwitch;
