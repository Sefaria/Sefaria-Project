import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText} from './Misc';
import { tipsService } from './TipsService';
import '../css/TipsOverlay.css';

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

/**
 * TipsOverlay component displays helpful tips and guides to users
 * @param {Object} props - Component props
 * @param {function} props.onClose - Function to call when overlay is closed
 * @param {string} props.guideType - Type of guide to display (e.g., "reader", "sheets")
 */
const TipsOverlay = ({ 
  onClose,
  guideType = "reader"
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [tipData, setTipData] = useState(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Load tips data on component mount
  useEffect(() => {
    console.log("TipsOverlay component mounted, loading tips for:", guideType);
    
    const loadTips = async () => {
      setLoading(true);
      try {
        const data = await tipsService.getTips(guideType);
        setTipData(data);
        setCurrentTipIndex(0);
      } catch (error) {
        console.error("Error loading tips:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadTips();
  }, [guideType]);
  
  const handleClose = () => {
    console.log("TipsOverlay closing");
    setIsOpen(false);
    if (onClose) onClose();
  };

  // Handle navigation between tips with circular looping
  const nextTip = () => {
    if (!tipData || !tipData.tips.length) return;
    setCurrentTipIndex((currentIndex) => 
      currentIndex >= tipData.tips.length - 1 ? 0 : currentIndex + 1
    );
  };

  const prevTip = () => {
    if (!tipData || !tipData.tips.length) return;
    setCurrentTipIndex((currentIndex) => 
      currentIndex <= 0 ? tipData.tips.length - 1 : currentIndex - 1
    );
  };

  if (!isOpen) return null;
  if (loading || !tipData) return <div className="tipsOverlay"><div className="loadingMessage">Loading tips...</div></div>;
  
  const currentTip = tipData.tips[currentTipIndex];
  
  return (
    <div className="tipsOverlay">
      <div className="tipsOverlayContent">
        <div className="tipsOverlayHeader">
          <button className="closeButton" onClick={handleClose} aria-label="Close">
            <div className="closeButtonBackground">
              <img src="/static/icons/close-outline.svg" alt="Close" />
            </div>
          </button>
        </div>
        
        <TruncatedTitle text={currentTip.title} />
        
        <div className="tipsOverlayBody">
          <div className="tipsOverlayImageAndText">
            <div className="tipsOverlayImageBox">
              {currentTip.imageUrl ? (
                <img src={currentTip.imageUrl} alt={currentTip.imageAlt} className="tipsOverlayImage" />
              ) : (
                <div className="tipsOverlayImagePlaceholder"></div>
              )}
            </div>
            
            <div className="tipsOverlayTextBox">
              <div className="tipsOverlayText">
                <InterfaceText>{currentTip.text}</InterfaceText>
              </div>
            </div>
          </div>
          
          {tipData.tips.length > 1 && (
            <div className="tipsOverlayNavigation">
              <button 
                onClick={prevTip} 
                className="tipNavigationButton"
                aria-label="Previous tip"
              >
                Previous
              </button>
              <div className="tipsPagination">
                {currentTipIndex + 1} / {tipData.tips.length}
              </div>
              <button 
                onClick={nextTip} 
                className="tipNavigationButton"
                aria-label="Next tip"
              >
                Next
              </button>
            </div>
          )}
        </div>
        
        <TipsFooter links={currentTip.links} />
      </div>
    </div>
  );
};

TipsOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  guideType: PropTypes.string
};

export default TipsOverlay; 