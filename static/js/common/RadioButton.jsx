import React from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "../Misc";
import Util from "../sefaria/util";

export default function RadioButton  ({isActive, onClick, value, name, label, id, onKeyDown, ...rest}) {
    const handleChange = (e) => {
        e.stopPropagation();
        onClick();
    };

    const handleKeyDown = (e) => {
        Util.handleRadioKeyDown(e, {
            name,
            onSelect: onClick,
            onKeyDown
        });
    };

    return (
        <div className='button'>
            <label htmlFor={id}>
                <InterfaceText>{label}</InterfaceText>
            </label>
            <input
                type='radio'
                id={id}
                checked={isActive}
                name={name}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                {...rest}
            />
        </div>
    );
}
RadioButton.propTypes = {
    isActive: PropTypes.bool.isRequired,
    onClick: PropTypes.func.isRequired,
    value: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    label: PropTypes.string,
    onKeyDown: PropTypes.func,
}
