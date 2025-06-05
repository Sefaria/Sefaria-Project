import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText, EnglishText, HebrewText, CloseButton } from './Misc';
import Sefaria from './sefaria/sefaria';
import '../css/TipsOverlay.css';

const localize = (str) => Sefaria._(str, "Guide");

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
          <a href={link.url} className="tipsOverlayFooterLink" target="_blank" rel="noopener noreferrer">
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
 * Only shows on first time user opens sheets, using cookie-based persistence
 * Can be forced to show using the forceShow prop
 * 
 * @param {Object} props - Component props
 * @param {function} props.onClose - Function to call when overlay is closed
 * @param {string} props.guideType - Type of guide to display (e.g., "reader", "sheets")
 * @param {boolean} props.forceShow - Force the overlay to show regardless of cookie state
 */
const TipsOverlay = ({ 
  onClose,
  guideType = "sheets",
  forceShow = false
}) => {
  const cookieName = `tips_overlay_seen_${guideType}`;
  const initialShouldShow = forceShow || !$.cookie(cookieName);
  
  const [isOpen, setIsOpen] = useState(false);
  const [tipData, setTipData] = useState(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Load tips data on component mount
  useEffect(() => {
    console.log("TipsOverlay component mounted, loading tips for:", guideType);
    
    const loadTips = async () => {
      setLoading(true);
      try {
        const data = await Sefaria.getTips(guideType);
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

  useEffect(() => {
    // Force rerendering of the component when initially rendered by ssr
    setIsOpen(initialShouldShow);
  }, [initialShouldShow]);
  
  const setCookie = () => {
    // Store the current date when user dismisses the overlay
    const currentDate = new Date().toISOString();
    $.cookie(cookieName, currentDate, {path: "/", expires: 20*365}); // 20 year expiration
    setIsOpen(false);
  };

  const handleClose = () => {
    console.log("TipsOverlay closing");
    setCookie();
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

  // Don't render if user has already seen it or if not open
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
                aria-label={localize("Previous tip")}
              >
                <InterfaceText>
                  <EnglishText>
                    <img src="/static/img/zondicons_arrow-left.svg" alt={localize("Previous")} />
                  </EnglishText>
                  <HebrewText>
                    <img src="/static/img/zondicons_arrow-right.svg" alt={localize("Previous")} />
                  </HebrewText>
                </InterfaceText>
              </button>
              <span className="tipsPaginationNumber">
                <InterfaceText>{`${currentTipIndex + 1} ${localize("of")} ${tipData.tips.length}`}</InterfaceText>
              </span>
              <button 
                onClick={nextTip} 
                className="paginationArrowButton"
                aria-label={localize("Next tip")}
              >
                <InterfaceText>
                  <EnglishText>
                    <img src="/static/img/zondicons_arrow-right.svg" alt={localize("Next")} />
                  </EnglishText>
                  <HebrewText>
                    <img src="/static/img/zondicons_arrow-left.svg" alt={localize("Next")} />
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
            {/* Video container or placeholder */}
            <div className="tipsOverlayVideoContainer">
              {currentTip.videoUrl.en ? ( // Using en becasue I assume that it's more likely to be available. In edge case where en exists but he doesn't, the an empty video will be shown in he.
                <video 
                  src={Sefaria.getLocalizedVideoDataFromCard(currentTip).videoUrl}
                  className="tipsOverlayVideo" 
                  controls
                  preload="metadata"
                  aria-label={Sefaria.getLocalizedVideoDataFromCard(currentTip).videoAlt}
                >
                  {/* TODO: Add a fallback for browsers that don't support the video tag */}
                  <InterfaceText>{localize("Your browser does not support the video tag.")}</InterfaceText>
                </video>
              ) : ( // TODO Add remove this fallback.
                <div className="tipsOverlayVideoPlaceholder">
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
  guideType: PropTypes.string,
  forceShow: PropTypes.bool
};

/**
 * Utility function to clear the tips overlay cookie for a given guide type
 * Useful for testing and development - allows the overlay to show again
 * @param {string} guideType - The type of guide (e.g., "sheets", "reader")
 */
export const clearTipsOverlayCookie = (guideType) => {
  const cookieName = `tips_overlay_seen_${guideType}`;
  $.removeCookie(cookieName, {path: "/"});
  console.log(`Cleared tips overlay cookie for guide type: ${guideType}`);
};

export default TipsOverlay; 