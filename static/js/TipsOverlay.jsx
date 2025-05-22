import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {CloseButton, InterfaceText} from './Misc';

const TipsOverlay = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  useEffect(() => {
    console.log("TipsOverlay component mounted");
  }, []);
  
  const handleClose = () => {
    console.log("TipsOverlay closing");
    setIsOpen(false);
    if (onClose) onClose();
  };

  if (!isOpen) return null;
  
  return (
    <div className="tipsOverlay">
      <div className="tipsOverlayContent">
        <div className="tipsOverlayHeader">
          <InterfaceText>Tips & Tricks</InterfaceText>
          <CloseButton onClick={handleClose} />
        </div>
        <div className="tipsOverlayBody">
          <InterfaceText>
            Welcome to Sefaria! Here you'll find helpful tips to enhance your reading experience.
            Click through these tips to learn about features that can help you study and explore texts.
          </InterfaceText>
        </div>
      </div>
    </div>
  );
};

TipsOverlay.propTypes = {
  onClose: PropTypes.func.isRequired
};

export default TipsOverlay; 