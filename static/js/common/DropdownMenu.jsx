import React, {createContext, useContext, useRef, useState} from 'react';
import PropTypes from "prop-types";
import {useOutsideClick} from "../Hooks";

const FallbackContext = createContext(null);

const useIsMenuOpen = (context) => {
    //React must have the same hooks any time, so we should have context and state any way.
    //For that we also define FallbackContext. It's defined outside for not be created in any use but only once.
    const contextValue = useContext(context || FallbackContext);
    const [stateIsMenuOpen, stateSetIsMenuOpen] = useState(false);
    return contextValue ? [contextValue.isMenuOpen, contextValue.setIsMenuOpen] : [stateIsMenuOpen, stateSetIsMenuOpen];
}

const DropdownMenu = ({children, buttonContent, context=null}) => {
  /**
  context - if provided, would be used for menu opening (which also be available outside.
            if not, will use state (and the opening won't be availabe in the parent component)
  */
  const [isMenuOpen, setIsMenuOpen] = useIsMenuOpen(context);
  const wrapperRef = useRef(null);
  useOutsideClick(wrapperRef, () => setIsMenuOpen(false), isMenuOpen);
  const onClick = () => setIsMenuOpen(!isMenuOpen)

  return (
    <div className="dropdownMenu" ref={wrapperRef}>
      <button className="dropdownButton" onClick={onClick}>{buttonContent}</button>
      {isMenuOpen && children}
    </div>
  );
};
DropdownMenu.propTypes = {
    buttonContent: PropTypes.elementType.isRequired,
};
export default DropdownMenu;
