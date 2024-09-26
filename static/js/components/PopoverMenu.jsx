import React, {useContext, useRef} from 'react';
import PropTypes from "prop-types";
import {useOutsideClick} from "../Hooks";

const PopoverMenu = ({buttonContent, menu, context}) => {
  const {isMenuOpen, setIsMenuOpen} = useContext(context);
  const wrapperRef = useRef(null);
  useOutsideClick(wrapperRef, () => setIsMenuOpen(false), isMenuOpen);
  const onClock = () => setIsMenuOpen(!isMenuOpen)

  return (
    <div className="popover-menu" ref={wrapperRef}>
      <button className="popover-button" onClick={onClock}>{buttonContent}</button>
      {isMenuOpen && menu}
    </div>
  );
};
PopoverMenu.propTypes = {
    buttonContent: PropTypes.elementType.isRequired,
    menu: PropTypes.elementType.isRequired,
};
export default PopoverMenu;
