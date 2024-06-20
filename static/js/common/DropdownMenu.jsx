import React, {useContext, useEffect, useRef, useState} from 'react';


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

    <a className={`interfaceLinks-option int-bi int-en dropdownItem`} href={url}>
      {children}
    </a>

  );
}

const DropdownMenuItemWithIcon = ({icon, text}) => {
  return (
    <>
      <div className="dropdownHeader">
        <img src={icon} />
        <span className='dropdownHeaderText'>{text}</span>
      </div>
      <div className='dropdownDesc'>Lorem ipsum dolor sit amet, lorem dolor.</div>
  </>
  );
}

const DropdownMenu = ({children}) => {
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
        <div className="interfaceLinks" ref={wrapperRef}>
          <a className="interfaceLinks-button" onClick={handleClick}><img src="/static/icons/module_switcher_icon.svg" alt={Sefaria._('Toggle Module Switcher')}/></a>
          <div className={`interfaceLinks-menu ${ isOpen ? "open" : "closed"}`}>
            <div className="interfaceLinks-options">
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