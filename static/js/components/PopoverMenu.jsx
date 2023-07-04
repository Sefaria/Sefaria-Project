import React, { useState } from 'react';
import PropTypes from "prop-types";

const PopoverMenu = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };
  return (
    <div className="popover-menu">
      <button className="popover-button" onClick={() => setIsOpen(!isOpen)}>{props.button}</button>
      {isOpen && props.menu}
    </div>
  );
};
PopoverMenu.prototypes = {
    button: PropTypes.elementType.isRequired,
    menu: PropTypes.elementType.isRequired,
};
export default PopoverMenu;
