import React, {useContext, useEffect, useRef, useState} from 'react';

const DropdownMenu = ({header, bodyItems}) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);
  
    const getCurrentPage = () => {
      return isOpen ? (encodeURIComponent(Sefaria.util.currentPath())) : "/";
    }
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
          <a className="interfaceLinks-button" onClick={handleClick}><img src="/static/icons/globe-wire.svg" alt={Sefaria._('Toggle Interface Language Menu')}/></a>
          <div className={`interfaceLinks-menu ${ isOpen ? "open" : "closed"}`}>
            { header ? 
                (
                    <div className="interfaceLinks-header">
                        <span className="int-en">{header}</span>
                    </div>
                ) 
            : null}

            <div className="interfaceLinks-options">
              {bodyItems.map(item =>
                  <a className={`interfaceLinks-option int-bi int-en dropdownItem`} href={item.url}>
                    <div className="dropdownHeader">
                          <img src={item.icon} />
                          <span className='dropdownHeaderText'>{item.text}</span>
                      </div>
                    <div className='dropdownDesc'>Lorem ipsum dolor sit amet, lorem dolor.</div>
                  </a>)
              }
              {/* <a className={`interfaceLinks-option int-bi int-he ${(currentLang == 'hebrew') ? 'active':''}`} href={`/interface/hebrew?next=${getCurrentPage()}`}>עברית</a>
              <a className={`interfaceLinks-option int-bi int-en ${(currentLang == 'english') ? 'active' : ''}`} href={`/interface/english?next=${getCurrentPage()}`}>English</a> */}
            </div>
          </div>
        </div>
    );
  }


  export {
    DropdownMenu
  };