import React, {useContext, useRef} from 'react';
import PropTypes from "prop-types";
import {useOutsideClick} from "../Hooks";

const DropdownMenu = ({buttonContent, menu, context}) => {
  const {isMenuOpen, setIsMenuOpen} = useContext(context);
  const wrapperRef = useRef(null);
  useOutsideClick(wrapperRef, () => setIsMenuOpen(false), isMenuOpen);
  const onClock = () => setIsMenuOpen(!isMenuOpen)

  return (
    <div className="dropdownMenu" ref={wrapperRef}>
      <button className="dropdownButton" onClick={onClock}>{buttonContent}</button>
      {isMenuOpen && menu}
    </div>
  );
};
DropdownMenu.propTypes = {
    buttonContent: PropTypes.elementType.isRequired,
    menu: PropTypes.elementType.isRequired,
};
export default DropdownMenu;
