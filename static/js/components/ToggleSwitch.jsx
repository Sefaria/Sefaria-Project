import React from "react";
import PropTypes from "prop-types";

function ToggleSwitch(props) {
    const name = props.name;
    return (
        <div className="toggle-switch-container">
          <div className="toggle-switch">
            <input
                type="checkbox"
                className="toggle-switch-checkbox"
                name={name}
                id={name}
                disabled={props.disabled}
            />
            <label className="toggle-switch-label" htmlFor={name}>
              <span className="toggle-switch-inner" />
              <span className="toggle-switch-switch" />
            </label>
          </div>
        </div>
    );
}
ToggleSwitch.proptypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
};
export default ToggleSwitch;
