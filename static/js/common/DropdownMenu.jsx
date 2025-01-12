import React, {useContext, useEffect, useRef, useState} from 'react';
import { InterfaceText } from '../Misc';

const DropdownMenuSeparator = () => {

  return (
    <div className='dropdownSeparator'></div>
  );

}

const DropdownMenuItem = ({url, children, newTab}) => {
  const dropDownClasses = `interfaceLinks-option int-bi dropdownItem`;
  if (!url) {
      return (
          <div className={dropDownClasses}>
              {children}
          </div>
      );
  }

  if (!newTab){
    newTab = false;
  }

  return (
    <a className={dropDownClasses} href={url} target={newTab ? '_blank' : null}>
      {children}
    </a>

      );
}

const DropdownMenuItemWithIcon = ({icon, textEn, textHe, onClick, descEn='',
                                  descHe=''}) => {
  return (
    <>
      <div className="dropdownHeader" onClick={() => onClick()}>
        <img src={icon} />
        <span className='dropdownHeaderText'>
          <InterfaceText text={{'en': textEn, 'he': textHe}} />
        </span>
      </div>
      <div className='dropdownDesc'>
        <InterfaceText text={{'en': descEn, 'he': descHe}} />
      </div>
  </>
  );
}

const DropdownMenu = ({children, menuIconComponent}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const handleClick = (e) => {
        e.stopPropagation();
        setIsOpen(isOpen => !isOpen);
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
        <div className="dropdownLinks" ref={wrapperRef}>
           <a className="dropdownLinks-button" onClick={handleClick}>
              {menuIconComponent} 
          </a>         
          <div className={`dropdownLinks-menu ${ isOpen ? "open" : "closed"}`}>
            <div className="dropdownLinks-options">
              {children}
            </div>
          </div>
        </div>
    );
}


  export {
    DropdownMenu, 
    DropdownMenuSeparator, 
    DropdownMenuItemWithIcon,
    DropdownMenuItem
  };