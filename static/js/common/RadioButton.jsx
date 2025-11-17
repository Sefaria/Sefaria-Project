import React, {useRef, useEffect} from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "../Misc";
import Util from "../sefaria/util";

export default function RadioButton  ({isActive, onClick, value, name, label, id, onKeyDown, ...rest}) {
    const inputRef = useRef(null);
    const wasActiveRef = useRef(isActive);

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

    // Text menu re-renders swap out the radio inputs; when that happens we
    // explicitly restore focus to the newly active option so keyboard users
    // don't get bumped back into the document body (which React would do by default).
    useEffect(() => {
        if (isActive && !wasActiveRef.current) {
            inputRef.current?.focus();
        }
        wasActiveRef.current = isActive;
    }, [isActive]);

    return (
        <div className='button'>
            <label htmlFor={id}>
                <InterfaceText>{label}</InterfaceText>
            </label>
            <input
                ref={inputRef}
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
