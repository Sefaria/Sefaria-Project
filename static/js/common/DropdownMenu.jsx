import React, {useEffect, useRef, useState} from 'react';
import PropTypes from "prop-types";


const DropdownMenu = ({children, buttonContent}) => {
    /**
     * buttonContent is a React component for the opening/closing of a button.
     * the menu will be closed in click anywhere except in an element with classname 'preventClosing'.
     * this class is using useRef for open/close rather than useState, for changing state triggers re-rendering of the
     * component and all its children, so when clicking on children their onClick won't be executed.
     */

    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const handleClick = (e) => {
      e.stopPropagation();
      const preventClose = e.target.closest('.preventClosing');
      // Only toggle if no preventClose element was found
      if (!preventClose) {
        setIsOpen(isOpen => !isOpen);
      }
    }
    const handleHideDropdown = (event) => {
      if (event.key === 'Escape') {
          setIsOpen(false);
      }
    };
    const handleClickOutside = (event) => {
        if (
            wrapperRef.current &&
            !wrapperRef.current.contains(event.target)
        ) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener('keydown', handleHideDropdown, true);
        document.addEventListener('click', handleClickOutside, true);
        return () => {
            document.removeEventListener('keydown', handleHideDropdown, true);
            document.removeEventListener('click', handleClickOutside, true);
        };
    }, []);

  return (
    <div className="dropdownMenu" onClick={handleClick} ref={wrapperRef}>
      <button className="dropdownButton" >{buttonContent}</button>
        <div className={ `dropdownLinks-menu ${isOpen ? 'open' : 'closed'}`} >
            {children}
        </div>
    </div>
  );
};
DropdownMenu.propTypes = {
    buttonContent: PropTypes.elementType.isRequired,
};
export default DropdownMenu;
