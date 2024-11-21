import React, {useEffect, useRef, useState} from 'react';
import PropTypes from "prop-types";


const DropdownMenu = ({children, buttonContent}) => {
    /**
     * buttonContent is a React component for the opening/closing of a button.
     * the menu will be closed in click anywhere except in an element with classname 'preventClosing'.
     * this class is using useRef for open/close rather than useState, for changing state triggers re-rendering of the
     * component and all its children, so when clicking on children their onClick won't be executed.
     */

    const dropdownLinksClass = 'dropdownLinks-menu';
    const isOpenRef = useRef(null);

    const setIsOpen = (isOpen) => {
        if (isOpenRef.current) {
            isOpenRef.current.className = `${dropdownLinksClass} ${isOpen ? 'open' : 'closed'}`;
            const action = isOpen ? 'addEventListener' : 'removeEventListener';
            document[action]('keydown', handleHideDropdown, true);
            document[action]('click', handleClickOutside, true);
        }
    }
    const handleClick = (e) => {
      e.stopPropagation();
      if (isOpenRef.current?.className?.includes('open')) {
          setIsOpen(false);
      } else {
          setIsOpen(true);
      }
    }
    const handleHideDropdown = (event) => {
      if (event.key === 'Escape') {
          setIsOpen(false);
      }
    };
    const handleClickOutside = (event) => {
      if (!event.target.closest('.preventClosing')) {
          setIsOpen(false);
      }
    };

  return (
    <div className="dropdownMenu">
      <button className="dropdownButton preventClosing" onClick={handleClick}>{buttonContent}</button>
        <div className={ `${dropdownLinksClass} closed`} ref={isOpenRef}>
            {children}
        </div>
    </div>
  );
};
DropdownMenu.propTypes = {
    buttonContent: PropTypes.elementType.isRequired,
};
export default DropdownMenu;
