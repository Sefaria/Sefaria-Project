import React from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "../Misc";

export default function RadioButton  ({isActive, onClick, value, name, text, ...rest}) {
    return (
        <div
            className='button'
            onClick={onClick}
            role='radio'
            aria-checked={isActive}
        >
            <label htmlFor={value}><InterfaceText>{text}</InterfaceText></label>
            <input
                type='radio'
                id={text}
                checked={isActive}
                name={name}
                value={value}
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
    text: PropTypes.string,
}
