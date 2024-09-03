import React, {useContext, useEffect, useRef, useState} from 'react';
import { InterfaceText } from '../Misc';


// Todo
// Fix the styling on the 'dropdown item' (regular one)
// Restore the header to also show the globe icon

const DropdownMenuSeparator = () => {

  return (
    <div className='dropdownSeparator'></div>
  );

}

const DropdownMenuItem = ({url, children}) => {
  return (

    <a className={`interfaceLinks-option int-bi dropdownItem`} href={url} target="_blank">
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

const DropdownMenu = ({children, toggle}) => {
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
            <a className="dropdownLinks-button" onClick={handleClick}>{toggle}</a>
            <div className={`dropdownLinks-menu ${isOpen ? "open" : "closed"}`}>
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
    DropdownMenuItem,
    DropdownMenuItemWithIcon
  };