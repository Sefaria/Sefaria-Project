import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {CloseButton, InterfaceText} from './Misc';
import Sefaria from './sefaria/sefaria';

// TruncatedTitle component that handles title truncation
const TruncatedTitle = ({ text, maxLines = 1 }) => {
  const [truncationOccurred, setTruncationOccurred] = useState(false);
  const [shouldAttemptTruncation, setShouldAttemptTruncation] = useState(true);
  const textRef = useRef(null);

  useEffect(() => {
    const element = textRef.current;
    if (element) {
      const computedStyles = window.getComputedStyle(element);
      const maxHeight = parseInt(computedStyles.getPropertyValue('max-height'), 10);
      setTruncationOccurred(element.scrollHeight > maxHeight + 1);
    }
  }, [text]);

  const onEllipsisClick = () => {
    setShouldAttemptTruncation(false);
    setTruncationOccurred(false);
  };

  return (
    <div className="tipsOverlayTitleWrapper">
      <div 
        className={`tipsOverlayTitle ${shouldAttemptTruncation && 'shouldAttemptTruncation'}`}
        ref={textRef}
        style={{ '--num-lines': maxLines }}
      >
        <InterfaceText>{text}</InterfaceText>
      </div>
      {truncationOccurred && 
        <a className='ellipsis' onClick={onEllipsisClick}>…</a>
      }
    </div>
  );
};

TruncatedTitle.propTypes = {
  text: PropTypes.string.isRequired,
  maxLines: PropTypes.number
};

// Footer component with links
const TipsFooter = ({ links }) => {
  return (
    <div className="tipsOverlayFooter">
      {links.map((link, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="footerDivider">•</span>}
          <a href={link.url} className="tipsOverlayFooterLink">
            <InterfaceText>{link.text}</InterfaceText>
          </a>
        </React.Fragment>
      ))}
    </div>
  );
};

TipsFooter.propTypes = {
  links: PropTypes.arrayOf(PropTypes.shape({
    text: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    url: PropTypes.string.isRequired
  }))
};

const TipsOverlay = ({ 
  onClose,
  title = "Tips & Tricks", 
  imageUrl = "", 
  imageAlt = "Tips image",
  text = "Welcome to Sefaria! Here you'll find helpful tips to enhance your reading experience. Click through these tips to learn about features that can help you study and explore texts.",
  links = [
    { text: "Learn More", url: "/help" },
    { text: "Feedback", url: "/feedback" }
  ]
}) => {
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
          <button className="closeButton" onClick={handleClose} aria-label="Close">
            <img src="/static/icons/close-outline.svg" alt="Close" />
          </button>
        </div>
        
        <TruncatedTitle text={title} />
        
        <div className="tipsOverlayBody">
          <div className="tipsOverlayImageAndText">
            <div className="tipsOverlayImageBox">
              {imageUrl ? (
                <img src={imageUrl} alt={imageAlt} className="tipsOverlayImage" />
              ) : (
                <div className="tipsOverlayImagePlaceholder"></div>
              )}
            </div>
            
            <div className="tipsOverlayTextBox">
              <div className="tipsOverlayText">
                <InterfaceText>{text}</InterfaceText>
              </div>
            </div>
          </div>
        </div>
        
        <TipsFooter links={links} />
      </div>
    </div>
  );
};

TipsOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  imageUrl: PropTypes.string,
  imageAlt: PropTypes.string,
  text: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  links: PropTypes.arrayOf(PropTypes.shape({
    text: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    url: PropTypes.string.isRequired
  }))
};

export default TipsOverlay; 