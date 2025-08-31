import React, {useEffect, useRef, useState} from 'react';
import PropTypes from "prop-types";
import { InterfaceText, getCurrentPage } from '../Misc';
import Sefaria from '../sefaria/sefaria';

const DropdownMenuSeparator = () => {

  return (
    <div className='dropdownSeparator'></div>
  );

}

const DropdownMenuItem = ({url, children, newTab, customCSS = null, preventClose = false, targetModule = null}) => {

  if (!newTab){
    newTab = false;
  }

  const cssClasses = customCSS ? customCSS : 'interfaceLinks-option int-bi dropdownItem';
  const fullURL = targetModule ? Sefaria.util.fullURL(url, targetModule) : url;

  return (
    <a className={cssClasses}
       href={fullURL}
       target={newTab ? '_blank' : null}
       data-prevent-close={preventClose}
       onClick={(e) => { /* Let browser handle navigation naturally */ }}
       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
    >
      {children}
    </a>

  );
}

const DropdownMenuItemLink = ({url, children, newTab, preventClose = false}) => {

  if (!newTab){
    newTab = false;
  }
  return (
    <a className={`interfaceLinks-option int-bi dropdownItem`}
       href={url}
       target={newTab ? '_blank' : null}
       data-prevent-close={preventClose}
       onClick={(e) => { /* Let browser handle navigation naturally */ }}
       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
    >
      {children}
    </a>
  );
}

const DropdownMenuItemWithCallback = ({onClick, children, preventClose = false}) => {
  return (
    <div 
      className={'interfaceLinks-option int-bi dropdownItem'} 
      onClick={onClick} 
      data-prevent-close={preventClose}
      role="button"
      tabIndex="0"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } }}
    >
        {children}
    </div>
  );
}

const DropdownMenuItemWithIcon = ({icon, textEn='', descEn='', descHe=''}) => {
  return (
    <>
      <div className="dropdownHeader">
        <img src={icon} alt="Menu icon" />
        <span className='dropdownHeaderText'>
          <InterfaceText>{textEn}</InterfaceText>
        </span>
      </div>
      {!!descEn && descEn.length > 0 &&
        <div className='dropdownDesc'>
          <InterfaceText text={{'en': descEn, 'he': descHe}} />
        </div>
      }
  </>
  );
}

const DropdownMenu = ({children, buttonComponent, positioningClass}) => {
    /**
     * `buttonComponent` is a React component for the opening/closing of a button.
     * `positioningClass` is a string for the positioning of the dropdown menu.  It defines a CSS class.
     *  Currently, we have two possible classes: 'headerDropdownMenu' and 'readerDropdownMenu'.
     *  The former is a more general case.  Historically, the former was used in the header
     *  and the latter in the reader.  See s2.css for definition of these classes.
     * the menu will be closed in click anywhere except in an element where data attribute data-prevent-close="true" is set.
     * this class is using useRef for open/close rather than useState, for changing state triggers re-rendering of the
     * component and all its children, so when clicking on children their onClick won't be executed.
     */

    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const wrapperRef = useRef(null);
    const buttonRef = useRef(null);

    const handleButtonClick = (e) => {
      e.stopPropagation();
      setIsOpen(isOpen => !isOpen);
    };
    const handleContentsClick = (e) => {
      e.stopPropagation();
      const preventClose = e.target.closest('[data-prevent-close="true"]');
      // Only toggle if no preventClose element was found
      if (!preventClose) {
        setIsOpen(false);
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

    useEffect(() => {
        if (isOpen && menuRef.current) {
            // Focus the first focusable element when menu opens
            const firstFocusable = menuRef.current.querySelector('[tabindex="0"], button:not([disabled]), [href], input:not([disabled])');
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }
    }, [isOpen]);

    const handleMenuKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(false);
            // Return focus to the button
            if (buttonRef.current) {
                buttonRef.current.focus();
            }
            return;
        }

        if (e.key === 'Tab' && menuRef.current) {
            // Implement focus trapping within the menu
            const focusableElements = menuRef.current.querySelectorAll(
                '[tabindex="0"], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
            );
            
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    };

    return (
        <div className={positioningClass} ref={wrapperRef}>
           <div
             className="dropdownLinks-button"
           >
              {React.cloneElement(buttonComponent, { 
                onClick: handleButtonClick,
                ref: buttonRef,
                tabIndex: 0,
                onKeyDown: (e) => { 
                  if (e.key === 'Enter' || e.key === ' ') { 
                    e.preventDefault(); 
                    handleButtonClick(e); 
                  }
                }
              })}
          </div>
          <div 
            className={`dropdownLinks-menu ${ isOpen ? "open" : "closed"}`} 
            onClick={handleContentsClick}
            ref={menuRef}
            onKeyDown={handleMenuKeyDown}
          >
              {children}
          </div>
        </div>
    );
  }

  DropdownMenu.propTypes = {
    buttonComponent: PropTypes.element.isRequired,
  };



const DropdownLanguageToggle = () => (
    <>
      <div className="languageHeader">
        <InterfaceText>Site Language</InterfaceText>
      </div>
      <div className='dropdownLanguageToggle'>
      <span className='englishLanguageButton'>
        <a href={`/interface/english?next=${getCurrentPage()}`}>
          English
        </a>
      </span>
      <a href={`/interface/hebrew?next=${getCurrentPage()}`}>
        עברית
      </a>
      </div>
    </>
)

  export {
    DropdownMenu,
    DropdownMenuSeparator,
    DropdownMenuItemWithIcon,
    DropdownMenuItemLink,
    DropdownMenuItem, 
    DropdownMenuItemWithCallback,
    DropdownLanguageToggle
  };
