import React, {useEffect, useRef, useState} from 'react';
import PropTypes from "prop-types";
import { InterfaceText } from '../Misc';
import Sefaria from '../sefaria/sefaria';
import Util from '../sefaria/util';

const DropdownMenuSeparator = () => {

  return (
    <div className='dropdownSeparator'></div>
  );

}

const DropdownMenuItem = ({url, children, newTab, customCSS = null, preventClose = false, targetModule = null, analyticsEventName = null, analyticsEventText = null}) => {

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
       data-anl-event={analyticsEventName}
       data-anl-text={analyticsEventText}
       onKeyDown={(e) => Util.handleKeyboardClick(e)}
    >
      {children}
    </a>

  );
}

const NextRedirectAnchor = ({url, children, className}) => {
  const onClick = (e) => {
    e.preventDefault();
    const currentPath = Sefaria.util.currentPath();
    window.location.href = `${url}?next=${encodeURIComponent(currentPath)}`;
  };
  return (
    <a className={className || 'interfaceLinks-option int-bi dropdownItem'}
       href='#'
       onClick={(e) => onClick(e)}
       onKeyDown={(e) => Util.handleKeyboardClick(e, onClick)}
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
       onKeyDown={(e) => Util.handleKeyboardClick(e)}
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
      onKeyDown={(e) => Util.handleKeyboardClick(e, onClick)}
    >
        {children}
    </div>
  );
}

const DropdownMenuItemWithIcon = ({icon, textEn='', descEn='', descHe=''}) => {
  return (
    <>
      <div className="dropdownHeader">
        <img src={icon} alt={Sefaria._("Menu icon")} />
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

/**
 * DropdownModuleItem - A dropdown menu item for module navigation with a colored dot indicator
 *
 * Used primarily in the module switcher to allow navigation between different Sefaria modules
 * (Library, Voices, Developers). Displays a colored dot and bilingual text.
 *
 * @param {string} url - The destination URL for the link
 * @param {boolean} newTab - Whether to open the link in a new tab
 * @param {string} [targetModule] - The target module identifier (e.g., Sefaria.LIBRARY_MODULE).
 *                                  If provided, the URL will be constructed using Sefaria.util.fullURL
 * @param {string} dotColor - CSS variable name for the colored dot (e.g., '--sefaria-blue', '--sheets-green')
 * @param {Object} text - Bilingual text object with 'en' and 'he' keys
 * @param {string} text.en - English text to display
 * @param {string} text.he - Hebrew text to display
 *
 * @example
 * <DropdownModuleItem
 *   url={"/"}
 *   newTab={false}
 *   targetModule={Sefaria.LIBRARY_MODULE}
 *   dotColor={'--sefaria-blue'}
 *   text={{ en: "Library", he: "ספריה" }}
 * />
 */
const DropdownModuleItem = ({url, newTab, targetModule, dotColor, text}) => {
  const fullURL = targetModule ? Sefaria.util.fullURL(url, targetModule) : url;

  return (
    <a className="interfaceLinks-option int-bi dropdownItem dropdownModuleItem"
       href={fullURL}
       onKeyDown={(e) => Util.handleKeyboardClick(e)}
       target={newTab ? '_blank' : null}
       data-anl-event={"modswitch_item_click:click"}
       data-anl-text={text.en}>
      <div className="dropdownHeader">
        <span className="dropdownDot" style={{backgroundColor: `var(${dotColor})`}}></span>
        <span className='dropdownHeaderText'>
          <InterfaceText text={text}/>
        </span>
      </div>
    </a>
  );
}
DropdownModuleItem.propTypes = {
  url: PropTypes.string.isRequired,
  newTab: PropTypes.bool.isRequired,
  targetModule: PropTypes.string,
  dotColor: PropTypes.string.isRequired,
  text: PropTypes.shape({
    en: PropTypes.string.isRequired,
    he: PropTypes.string.isRequired
  }).isRequired
};

const DropdownMenu = ({children, buttonComponent, positioningClass, analyticsFeatureName = null, onOpen = null, onClose = null}) => {
    /**
     * DropdownMenu - A reusable dropdown menu component with keyboard navigation and analytics support
     *
     * @param {React.ReactNode} children - The content to display inside the dropdown menu
     * @param {React.ReactElement} buttonComponent - React component that triggers the dropdown (will be wrapped with click handler)
     * @param {string} positioningClass - CSS class for dropdown positioning. Options: 'headerDropdownMenu', 'readerDropdownMenu' (see s2.css)
     * @param {string} [analyticsFeatureName] - Optional feature name for analytics tracking (sets data-anl-feature_name)
     * @param {Function} [onOpen] - Optional callback fired when dropdown opens
     * @param {Function} [onClose] - Optional callback fired when dropdown closes. Receives event object: { type: 'passive' | 'active' }
     *
     * Behavior:
     * - Closes on: click outside, Escape key, Tab out, or clicking any item without data-prevent-close="true"
     * - Analytics: When analyticsFeatureName is provided, adds data-anl-* attributes for tracking open/close and item clicks
     * - Accessibility: Traps focus within dropdown when open, returns focus to button when closed
     * - Uses useState for isOpen to properly trigger re-renders for analytics data attributes
     */

    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);
    const wrapperRef = useRef(null);
    const buttonRef = useRef(null);

    const handleButtonClick = (e) => {
      e.stopPropagation();
      setIsOpen(isOpen => {
        const curState = !isOpen;
        if (curState) {
          onOpen?.();
        } else {
          onClose?.({ type: 'active' });
        }
        return curState;
      });
    };
    const handleContentsClick = (e) => {
      e.stopPropagation();

      const preventClose = e.target.closest('[data-prevent-close="true"]');
      // Only toggle if no preventClose element was found
      if (!preventClose) {
        setIsOpen(false);
        onClose?.({ type: 'active' });
      }
    };
    const handleHideDropdown = (event) => {
      if (event.key === 'Escape') {
          setIsOpen(false);
          onClose?.({ type: 'passive' });
      }
    };
    const handleClickOutside = (event) => {
        if (
            wrapperRef.current &&
            !wrapperRef.current.contains(event.target)
        ) {
            setIsOpen(false);
            onClose?.({ type: 'passive' });
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
            Util.focusFirstElement(menuRef.current);
        }
    }, [isOpen]);

    const handleMenuKeyDown = (e) => {
        Util.trapFocusWithTab(e, {
            container: menuRef.current,
            onClose: () => {
              setIsOpen(false)
              onClose?.(true); // Passive dismissal
            },
            returnFocusRef: buttonRef.current
        });
    };

    return (
        <div className={positioningClass}
             ref={wrapperRef}
             data-anl-feature_name={analyticsFeatureName}>
           <div
             className="dropdownLinks-button"
             data-anl-event={analyticsFeatureName ? (isOpen ? "modswitch_close:click" : "modswitch_open:click") : null}
           >
              {/* 
                Using React.cloneElement to inject dropdown behavior into the button.
                We receive a pre-created React element (e.g., <DisplaySettingsButton/>) and need to add:
                - onClick: toggle the dropdown
                - ref: manage focus for keyboard navigation
                - tabIndex & onKeyDown: ensure keyboard accessibility (Space/Enter to activate)
                
                This approach allows parent components to pass any button element they want,
                while DropdownMenu handles the dropdown logic without the parent needing to know
                the implementation details.
              */}
              {React.cloneElement(buttonComponent, {
                onClick: handleButtonClick,
                ref: buttonRef,
                tabIndex: 0,
                onKeyDown: (e) => Util.handleKeyboardClick(e, handleButtonClick)
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


const DropdownLanguageToggle = () => {
  return (
    <>
      <div className="languageHeader">
        <InterfaceText>Site Language</InterfaceText>
      </div>
      <div className='dropdownLanguageToggle'>
      <span className='englishLanguageButton'>
        <NextRedirectAnchor
           className={`englishLanguageLink ${(Sefaria.interfaceLang === 'english') ? 'active': ''}`}
           url={'/interface/english'}
        >
          English
        </NextRedirectAnchor>
      </span>
      <NextRedirectAnchor
          className={`hebrewLanguageLink ${(Sefaria.interfaceLang === 'hebrew') ? 'active': ''}`}
           url={'/interface/hebrew'}
      >
        עברית
      </NextRedirectAnchor>
      </div>
    </>
  )
}
  export {
    DropdownMenu,
    DropdownMenuSeparator,
    DropdownMenuItemWithIcon,
    NextRedirectAnchor,
    DropdownMenuItemLink,
    DropdownMenuItem,
    DropdownMenuItemWithCallback,
    DropdownModuleItem,
    DropdownLanguageToggle
  };
