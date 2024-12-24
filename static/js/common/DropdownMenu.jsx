import React, {useContext, useEffect, useRef, useState} from 'react';
import PropTypes from "prop-types";
import { InterfaceText } from '../Misc';


const DropdownMenuSeparator = () => {

  return (
    <div className='dropdownSeparator'></div>
  );

}

const DropdownMenuItem = ({url, children, newTab, preventClose = false}) => {

  if (!newTab){
    newTab = false;
  }

  return (
    <a className={`interfaceLinks-option int-bi dropdownItem`}
       href={url}
       target={newTab ? '_blank' : null}
       data-prevent-close={preventClose}>
      {children}
    </a>

  );
}

const DropdownMenuItemWithIcon = ({icon, textEn, textHe}) => {
  return (
    <>
      <div className="dropdownHeader">
        <img src={icon} />
        <span className='dropdownHeaderText'>
          <InterfaceText text={{'en': textEn, 'he': textHe}} />
        </span>
      </div>
      <div className='dropdownDesc'>
        <InterfaceText text={{'en': 'Lorem ipsum dolor sit amet, lorem dolor.', 'he': 'לורם איפסום דולור סיט אמט'}} />
      </div>
  </>
  );
}

const DropdownMenu = ({children, buttonComponent, positioningClass}) => {
    /**
     * buttonComponent is a React component for the opening/closing of a button.
     * the menu will be closed in click anywhere except in an element where data attribute
     * this class is using useRef for open/close rather than useState, for changing state triggers re-rendering of the
     * component and all its children, so when clicking on children their onClick won't be executed.
     */
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const handleClick = (e) => {
      e.stopPropagation();
      // Check if the clicked element or its parent has data-prevent-close
      const preventClose = e.target.closest('[data-prevent-close="true"]');
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
        <div className={positioningClass} ref={wrapperRef} onClick={handleClick}>
           <a className="dropdownLinks-button">
              {buttonComponent}
          </a>
          <div className={`dropdownLinks-menu ${ isOpen ? "open" : "closed"}`}>
              {children}
          </div>
        </div>
    );
  }

  DropdownMenu.propTypes = {
    buttonComponent: PropTypes.element.isRequired,
  };
  export {
    DropdownMenu,
    DropdownMenuSeparator,
    DropdownMenuItemWithIcon,
    DropdownMenuItem
  };