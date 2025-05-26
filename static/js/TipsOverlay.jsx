import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText, EnglishText, HebrewText, CloseButton } from './Misc';
import { tipsService } from './TipsService';
import Sefaria from './sefaria/sefaria';
import '../css/TipsOverlay.css';

/**
 * Title component with prefix
 * Text will naturally truncate if it exceeds container width
 */
const TitleWithPrefix = ({ prefix, title }) => {
  return (
    <h2 className="tipsOverlayTitle">
      {prefix && (
        <span className="titlePrefix">
          <InterfaceText text={prefix} />{' '}
        </span>
      )}
      <span className="titleVariable">
        <InterfaceText text={title} />
      </span>
    </h2>
  );
};

TitleWithPrefix.propTypes = {
  prefix: PropTypes.object,
  title: PropTypes.object.isRequired
};

/**
 * Footer component with consistent links for the guide type
 */
const TipsFooter = ({ links }) => {
  if (!links || links.length === 0) return null;

  return (
    <div className="tipsOverlayFooter">
      {links.map((link, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="footerDivider"> • </span>}
          <a href={link.url} className="tipsOverlayFooterLink">
            <InterfaceText text={link.text} />
          </a>
        </React.Fragment>
      ))}
    </div>
  );
};

TipsFooter.propTypes = {
  links: PropTypes.arrayOf(PropTypes.shape({
    text: PropTypes.object.isRequired,
    url: PropTypes.string.isRequired
  }))
};

/**
 * TipsOverlay component displays helpful tips and guides to users
 * Matches Figma design with proper spacing, scrollable content, and consistent layout
 * 
 * @param {Object} props - Component props
 * @param {function} props.onClose - Function to call when overlay is closed
 * @param {string} props.guideType - Type of guide to display (e.g., "reader", "sheets")
 */
const TipsOverlay = ({ 
  onClose,
  guideType = "sheets"
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

  /**
   * Navigate to next tip with circular looping
   */
  const nextTip = () => {
    if (!tipData || !tipData.tips.length) return;
    setCurrentTipIndex((currentIndex) => 
      currentIndex >= tipData.tips.length - 1 ? 0 : currentIndex + 1
    );
  };

  /**
   * Navigate to previous tip with circular looping
   */
  const prevTip = () => {
    if (!tipData || !tipData.tips.length) return;
    setCurrentTipIndex((currentIndex) => 
      currentIndex <= 0 ? tipData.tips.length - 1 : currentIndex - 1
    );
  };

  // Don't render if closed
  if (!isOpen) return null;
  
  // Show loading state
  if (loading || !tipData) {
    return (
      <div className="tipsOverlay">
        <div className="tipsOverlayContent">
          <div className="loadingMessage">
            <InterfaceText>
              <EnglishText>Loading tips...</EnglishText>
              <HebrewText>טוען טיפים...</HebrewText>
            </InterfaceText>
          </div>
        </div>
      </div>
    );
  }
  
  const currentTip = tipData.tips[currentTipIndex];
  const showNavigation = tipData.tips.length > 1;
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  
  return (
    <div className="tipsOverlay">
      <div className="tipsOverlayContent">
        {/* Header with title on left, pagination in center, close button on right */}
        <div className="tipsOverlayHeader">
          <div className="tipsOverlayTitleSection">
            <TitleWithPrefix 
              prefix={tipData.titlePrefix} 
              title={currentTip.title} 
            />
          </div>
          
          {showNavigation && (
            <div className="tipsOverlayPagination">
              <button 
                onClick={prevTip} 
                className="paginationArrowButton"
                aria-label={Sefaria._("Previous tip")}
              >
                <InterfaceText>
                  <EnglishText>
                    <img src="/static/img/zondicons_arrow-left.svg" alt={Sefaria._("Previous")} />
                  </EnglishText>
                  <HebrewText>
                    <img src="/static/img/zondicons_arrow-right.svg" alt={Sefaria._("Previous")} />
                  </HebrewText>
                </InterfaceText>
              </button>
              <span className="tipsPaginationNumber">
                <InterfaceText>
                  <EnglishText>{currentTipIndex + 1} of {tipData.tips.length}</EnglishText>
                  <HebrewText>{currentTipIndex + 1} מתוך {tipData.tips.length}</HebrewText>
                </InterfaceText>
              </span>
              <button 
                onClick={nextTip} 
                className="paginationArrowButton"
                aria-label={Sefaria._("Next tip")}
              >
                <InterfaceText>
                  <EnglishText>
                    <img src="/static/img/zondicons_arrow-right.svg" alt={Sefaria._("Next")} />
                  </EnglishText>
                  <HebrewText>
                    <img src="/static/img/zondicons_arrow-left.svg" alt={Sefaria._("Next")} />
                  </HebrewText>
                </InterfaceText>
              </button>
            </div>
          )}
          
          <CloseButton icon="circledX" onClick={handleClose} />
        </div>
        
        {/* Centered content container */}
        <div className="tipsOverlayCenteredContent">
          {/* Main content area */}
          <div className="tipsOverlayBody">
            {/* Image placeholder or actual image */}
            <div className="tipsOverlayImageContainer">
              {currentTip.imageUrl ? (
                <img 
                  src={currentTip.imageUrl} 
                  alt={Sefaria.interfaceLang === "hebrew" ? currentTip.imageAlt.he : currentTip.imageAlt.en} 
                  className="tipsOverlayImage" 
                />
              ) : (
                <div className="tipsOverlayImagePlaceholder">
                  <div className="placeholderContent">
                    <InterfaceText>
                      <EnglishText>
                        <div>1600x900</div>
                        <div>Video</div>
                        <div>at 480px wide ( x 270)</div>
                      </EnglishText>
                      <HebrewText>
                        <div>1600x900</div>
                        <div>וידאו</div>
                        <div>ברוחב 480px ( x 270)</div>
                      </HebrewText>
                    </InterfaceText>
                  </div>
                </div>
              )}
            </div>
            
            {/* Scrollable text content - narrower width */}
            <div className="tipsOverlayTextContainer">
              <div className="tipsOverlayText">
                <InterfaceText html={currentTip.text} />
              </div>
            </div>
          </div>
          
          {/* Footer with consistent links */}
          <TipsFooter links={tipData.footerLinks} />
        </div>
      </div>
    </div>
  );
};

TipsOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  guideType: PropTypes.string
};

export default TipsOverlay; 