import PropTypes from "prop-types";

function ToggleSwitch({name, disabled, onChange, isChecked}) {
    return (
        <div className="toggle-switch-container" data-prevent-close="true">
          <div className="toggle-switch focus-visible">
            <input
                type="checkbox"
                className="toggle-switch-checkbox"
                name={name}
                id={name}
                disabled={disabled}
                onChange={onChange}
                checked={isChecked && !disabled}
                aria-checked={isChecked}
                role="switch"
                aria-labelledby={`${name}-label`}
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
    ariaLabelledBy: PropTypes.string,
};
export default ToggleSwitch;
