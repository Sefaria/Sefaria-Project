import React from "react";
import PropTypes from "prop-types";
import {InterfaceText} from "../Misc";

export default function RadioButton  ({isActive, onClick, value, name, label, id, onKeyDown, ...rest}) {
    const handleKeyDown = (e) => {
        // Handle arrow keys for radio group navigation
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.stopPropagation(); // Prevent event from bubbling up and closing menu
            e.preventDefault();
            
            // Find all radio buttons in the same group
            const radioGroup = document.querySelectorAll(`input[name="${name}"]`);
            const currentIndex = Array.from(radioGroup).findIndex(radio => radio === e.target);
            
            let nextIndex;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                nextIndex = currentIndex === 0 ? radioGroup.length - 1 : currentIndex - 1;
            } else {
                nextIndex = currentIndex === radioGroup.length - 1 ? 0 : currentIndex + 1;
            }
            
            // Focus and select the next radio button
            const nextRadio = radioGroup[nextIndex];
            if (nextRadio) {
                nextRadio.focus();
                nextRadio.click(); // Trigger the selection
            }
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        }
        
        // Call custom onKeyDown if provided
        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    return (
        <div
            className='button'
            onClick={onClick}
        >
            <label htmlFor={id}><InterfaceText>{label}</InterfaceText></label>
            <input
                type='radio'
                id={id}
                checked={isActive}
                name={name}
                value={value}
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
