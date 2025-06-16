import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText, CloseButton, Arrow, LoadingMessage } from './Misc';
import Sefaria from './sefaria/sefaria';

const localize = (str) => Sefaria._(str, "Guide");

/**
 * Analytics helper function for guide overlay events
 */
const trackGuideEvent = (eventName, additionalParams = {}) => {
  gtag("event", eventName, additionalParams);
};

/**
 * Helper function to track pagination events
 */
const trackPaginationEvent = (newIndex, guideType, direction) => {
  trackGuideEvent("guide_overlay_pagination", {
    new_index: newIndex,
    guide_type: guideType,
    direction: direction
  });
};

/**
 * Title component with prefix
 * Text will naturally truncate if it exceeds container width
 */
const TitleWithPrefix = ({ prefix, title }) => {
  return (
    <h2 className="guideOverlayTitle">
      {prefix && (
        <span className="titlePrefix">
          <InterfaceText text={prefix} />
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
const GuideFooter = ({ links }) => {
  if (!links || links.length === 0) return null;

  const handleFooterLinkClick = (link, index) => {
    trackGuideEvent("guide_footer_link_clicked", {
      link_text: typeof link.text === 'object' ? link.text.en || link.text.he : link.text,
      position: index + 1
    });
  };

  return (
    <div className="guideOverlayFooter">
      {links.map((link, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="footerDivider"> • </span>}
          <a 
            href={link.url} 
            className="guideOverlayFooterLink" 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={() => handleFooterLinkClick(link, index)}
          >
            <InterfaceText text={link.text} />
          </a>
        </React.Fragment>
      ))}
    </div>
  );
};

GuideFooter.propTypes = {
  links: PropTypes.arrayOf(PropTypes.shape({
    text: PropTypes.object.isRequired,
    url: PropTypes.string.isRequired
  }))
};

/**
 * GuideOverlay component displays helpful guides and cards to users
 * Only shows on first time user opens the relevant page, using cookie-based persistence
 * Can be forced to show using the forceShow prop
 * 
 * @param {Object} props - Component props
 * @param {function} props.onClose - Function to call when overlay is closed
 * @param {string} props.guideType - Type of guide to display (e.g., "reader", "editor")
 * @param {boolean} props.forceShow - Force the overlay to show regardless of cookie state
 * @param {number} props.timeoutLength - Timeout length in seconds - After this time, the overlay will be closed and the user will be alerted that the guide is taking too long to load.
 */
const GuideOverlay = ({ 
  onClose,
  guideType = "editor",
  forceShow = false,
  timeoutLength = 7
}) => {
  const cookieName = `guide_overlay_seen_${guideType}`;
  const initialShouldShow = forceShow || !$.cookie(cookieName);
  
  const [isOpen, setIsOpen] = useState(false);
  const [guideData, setGuideData] = useState(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Force rerendering of the component when initially rendered
    setIsOpen(initialShouldShow);
    
    // Track guide overlay open event when it opens
    if (initialShouldShow) {
      trackGuideEvent("guide_overlay_opened", {
        guide_type: guideType
      });
    }
  }, [initialShouldShow]);

  // Load guide data only when component is actually open/visible to avoid unnecessary loading on common scenario where it isn't needed
  useEffect(() => {
    if (!isOpen) return;
    
    let isComponentMounted = true;
    let timeoutId;

    // Set up timeout to close component if loading takes too long
    // It's cleared with clearTimeout if the data is loaded successfully
    // Reason for this functionality: The guide is meant to clarify the page, if it causes more problems, it isn't worth the hassle
    timeoutId = setTimeout(() => {
      if (isComponentMounted) {
        console.warn(`Guide loading timed out after ${timeoutLength} seconds`);
        
        // Track timeout event
        trackGuideEvent("guide_overlay_timeout", {
          guide_type: guideType
        });
        
        handleClose();
        alert(Sefaria._("Something went wrong. Try refreshing the page", "EditorSaveIndicator"));
      }
    }, timeoutLength * 1000);

    const loadGuide = async () => {
      setLoading(true);

      try {
        
        const data = await Sefaria.getGuide(guideType);

        if (isComponentMounted) {
          clearTimeout(timeoutId); // Clear the timeout if the data is loaded successfully
          setGuideData(data);
          setCurrentCardIndex(0);
          
          // Track successful guide load
          trackGuideEvent("guide_overlay_loaded", {
            guide_type: guideType
          });
        }
      } catch (error) {
        console.error("Error loading guide:", error);
        if (isComponentMounted) {
          clearTimeout(timeoutId); // Clear the timeout if there is an error
          console.error("Error loading guide:", error);
          
          // Track error event
          trackGuideEvent("guide_overlay_error", {
            guide_type: guideType
          });
          
          handleClose();
          alert(Sefaria._("Something went wrong. Try refreshing the page", "EditorSaveIndicator"));
        }
      } finally {
        if (isComponentMounted) {
          setLoading(false);
        }
      }
    };
    
    loadGuide();
    
    // Cleanup on unmount
    return () => {
      isComponentMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isOpen, guideType, timeoutLength]);
  
  // Set cookie when user dismisses the overlay
  const setCookie = () => {
    // Store the current date when user dismisses the overlay
    const currentDate = new Date().toISOString();
    $.cookie(cookieName, currentDate, {path: "/", expires: 20*365}); // 20 year expiration
  };

  const handleClose = () => {
    // Track close event
    trackGuideEvent("guide_overlay_closed", {
      guide_type: guideType
    });
    
    setCookie();
    if (onClose) onClose();
    setIsOpen(false);
  };

  /**
   * Navigate to next card with circular looping
   */
  const nextCard = () => {
    if (!guideData || !guideData.cards.length) return;
    
    const newIndex = currentCardIndex >= guideData.cards.length - 1 ? 0 : currentCardIndex + 1;
    
    // Track pagination event
    trackPaginationEvent(newIndex, guideType, "next");
    
    setCurrentCardIndex(newIndex);
  };

  /**
   * Navigate to previous card with circular looping
   */
  const prevCard = () => {
    if (!guideData || !guideData.cards.length) return;
    
    const newIndex = currentCardIndex <= 0 ? guideData.cards.length - 1 : currentCardIndex - 1;
    
    // Track pagination event
    trackPaginationEvent(newIndex, guideType, "previous");
    
    setCurrentCardIndex(newIndex);
  };

  // Don't render if user has already seen it or if not open
  if (!isOpen) return null;
  
  // Show loading state
  if (loading || !guideData) {
    return (
      <div className="guideOverlay">
        <div className="guideOverlayContent">
          <div className="guideOverlayLoadingCenter">
            <LoadingMessage/>
          </div>
        </div>
      </div>
    );
  }
  
  const currentCard = guideData.cards[currentCardIndex];
  const showNavigation = guideData.cards.length > 1;
  
  return (
    <div className="guideOverlay">
      <div className="guideOverlayContent">
        {/* Header with title on left, pagination in center, close button on right */}
        <div className="guideOverlayHeader">
          <div className="guideOverlayTitleSection">
            <TitleWithPrefix 
              prefix={guideData.titlePrefix} 
              title={currentCard.title} 
            />
          </div>
          
          {showNavigation && (
            <div className="guideOverlayPagination">
              <Arrow 
                direction="left" 
                onClick={prevCard}
                altText={localize("Previous card")}
                reverseForRTL={true}
              />
              <span className="cardsPaginationNumber">
                <InterfaceText>{`${currentCardIndex + 1} ${localize("of")} ${guideData.cards.length}`}</InterfaceText>
              </span>
              <Arrow 
                direction="right" 
                onClick={nextCard}
                altText={localize("Next card")}
                reverseForRTL={true}
              />
            </div>
          )}
          
          <CloseButton icon="circledX" onClick={handleClose} />
        </div>
        
        {/* Centered content container */}
        <div className="guideOverlayCenteredContent">
          {/* Main content area */}
          <div className="guideOverlayBody">
            {/* Video container or placeholder */}
            <div className="guideOverlayVideoContainer">
              {guideData.cards.map((card, index) => (
                <video
                  key={index}
                  src={Sefaria.getLocalizedVideoDataFromCard(card).videoUrl}
                  preload="auto"
                  style={{ display: index === currentCardIndex ? 'block' : 'none' }}
                  className="guideOverlayVideo" 
                  controls
                  loop
                  autoPlay
                  muted // Added to avoid autoplay issues with browsers
                  playsInline // Added to avoid autoplay issues on mobile (even though we will likely not show this on mobile)
                >
                  <InterfaceText>{localize("Your browser does not support the video tag.")}</InterfaceText>
                </video>
              ))}
            </div>
            
            {/* Scrollable text content - narrower width */}
            <div className="guideOverlayTextContainer">
              <div className="guideOverlayText">
                <InterfaceText markdown={currentCard.text} />
              </div>
            </div>
          </div>
          
          {/* Footer with consistent links */}
          <GuideFooter links={guideData.footerLinks} />
        </div>
      </div>
    </div>
  );
};

GuideOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  guideType: PropTypes.string,
  forceShow: PropTypes.bool,
  timeoutLength: PropTypes.number
};

/**
 * Utility function to clear the guide overlay cookie for a given guide type
 * Useful for testing and development - allows the overlay to show again
 * @param {string} guideType - The type of guide (e.g., "sheets", "reader")
 */
export const clearGuideOverlayCookie = (guideType) => {
  const cookieName = `guide_overlay_seen_${guideType}`;
  $.removeCookie(cookieName, {path: "/"});
};

export default GuideOverlay; 