import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import {
  InterfaceText,
  CloseButton,
  Arrow,
  LoadingMessage,
  transformValues,
} from "./Misc";
import Sefaria from "./sefaria/sefaria";
import Cookies from "js-cookie";

const localize = (str) => Sefaria._(str, "Guide");

/**
 * Analytics helper functions for guide overlay events
 */
const getBaseAnalyticsParams = (guideType) => {
  return {
    project: "Quick Start Guide",
    feature_name: `Quick Start Guide - ${guideType}`,
  };
};

const getCurrentCardParams = (guideData, currentCardIndex) => {
  if (!guideData || !guideData.cards || !guideData.cards[currentCardIndex]) {
    return {};
  }

  const currentCard = guideData.cards[currentCardIndex];
  const cardTitle =
    typeof currentCard.title === "object"
      ? currentCard.title.en
      : currentCard.title; // Always use English for analytics consistency

  return {
    panel_name: cardTitle,
    panel_number: currentCardIndex + 1, // 1-based
  };
};

const trackGuideEvent = (eventName, guideType, additionalParams = {}) => {
  const baseParams = getBaseAnalyticsParams(guideType);
  const allParams = { ...baseParams, ...additionalParams };
  gtag("event", eventName, allParams);
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
  title: PropTypes.object.isRequired,
};

/**
 * Footer component with consistent links for the guide type
 */
const GuideFooter = ({ links, onLinkClick }) => {
  if (!links || links.length === 0) return null;

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
            onClick={() => onLinkClick(link, index)}
          >
            <InterfaceText text={link.text} />
          </a>
        </React.Fragment>
      ))}
    </div>
  );
};

GuideFooter.propTypes = {
  links: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.object.isRequired,
      url: PropTypes.string.isRequired,
    })
  ),
  onLinkClick: PropTypes.func.isRequired,
};

/**
 * GuideOverlay component displays helpful guides and cards to users
 * Only shows on first time user opens the relevant page, using cookie-based persistence
 * Can be forced to show using the forceShow prop
 *
 * IMPORTANT: When adding new guides, update the GUIDE_MAPPINGS in ReaderPanel.getGuideType()
 * That function is the central place that determines which guide type should be shown.
 * You also have to add the Guide Key in Sefaria-Project/guides/models.py under key/choices
 *
 * @param {Object} props - Component props
 * @param {function} props.onClose - Function to call when overlay is closed
 * @param {string} props.guideType - Type of guide to display (e.g., "reader", "editor")
 * @param {boolean} props.forceShow - Force the overlay to show regardless of cookie state
 * @param {number} props.timeoutLength - Timeout length in seconds - After this time, the overlay will be closed and the user will be alerted that the guide is taking too long to load.
 */
const GuideOverlay = ({
  onClose,
  guideType,
  forceShow = false,
  timeoutLength = 7,
}) => {
  const cookieName = `guide_overlay_seen_${guideType}`;

  const [isVisible, setIsVisible] = useState(false);
  const [guideData, setGuideData] = useState(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Track when overlay becomes visible to calculate duration on close
  const overlayStartTimeRef = useRef(null);

  const loadGuideData = () => {
    // Start tracking duration when overlay becomes visible
    overlayStartTimeRef.current = Date.now();

    // Prevents state updates and alerts after component unmounts to avoid alerts etc' after component is closed
    let isComponentMounted = true;
    let timeoutId;

    // Set up timeout to close component if loading takes too long
    // It's cleared with clearTimeout if the data is loaded successfully
    // Reason for this functionality: The guide is meant to clarify the page, if it causes more problems, it isn't worth the hassle
    timeoutId = setTimeout(() => {
      if (isComponentMounted) {
        handleClose(false);
        // It would be great to also trigger some sort of analytics here. It wasn't in the current spec.
        alert(
          Sefaria._(
            "Something went wrong. Try refreshing the page",
            "EditorSaveIndicator"
          )
        );
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
        }
      } catch (error) {
        if (isComponentMounted) {
          clearTimeout(timeoutId); // Clear the timeout if there is an error
          handleClose(false);
          alert(
            Sefaria._(
              "Something went wrong. Try refreshing the page",
              "EditorSaveIndicator"
            )
          );
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
  };

  // Cookie-based effect - runs once on mount to check if guide should auto-show
  useEffect(() => {
    if (!Cookies.get(cookieName) && !isVisible) {
      // Auto view fires when guide shows without being forced (no cookie exists)
      trackGuideEvent("guide_view_auto", guideType);
      setIsVisible(true);
      loadGuideData();
    }
  }, []);

  // ForceShow effect - responds to prop changes for manual guide display (guide button click)
  useEffect(() => {
    if (forceShow && !isVisible) {
      trackGuideEvent("guide_view_manual", guideType);
      setIsVisible(true);
      loadGuideData();
    }
  }, [forceShow, isVisible, guideType]);

  // Set cookie when user dismisses the overlay
  const setCookie = () => {
    // Store the current date when user dismisses the overlay
    const currentDate = new Date().toISOString();
    Cookies.set(cookieName, currentDate, { path: "/", expires: 20 * 365 }); // 20 year expiration
  };

  /**
   * Handles closing the guide overlay.
   * @param {boolean} [shouldSetCookie=true] - If true, sets a cookie to remember that the user dismissed the overlay.
   *   If false, does not set the cookie. This is useful when closing the overlay due to an error.
   */
  const handleClose = (shouldSetCookie = true) => {
    // Calculate duration in seconds (how long overlay was open)
    const durationMs = overlayStartTimeRef.current
      ? Date.now() - overlayStartTimeRef.current
      : 0;
    const durationSeconds = Math.floor(durationMs / 1000); // Round down to the second

    trackGuideEvent("guide_close", guideType, {
      ...getCurrentCardParams(guideData, currentCardIndex),
      duration: durationSeconds,
    });

    if (shouldSetCookie) setCookie();
    onClose();
    setIsVisible(false);
  };

  const handleFooterLinkClick = (link, index) => {
    const linkText = typeof link.text === "object" ? link.text.en : link.text; // Always use English for analytics consistency
    trackGuideEvent("guide_click", guideType, {
      ...getCurrentCardParams(guideData, currentCardIndex),
      text: linkText,
    });
  };

  const handleTextContentClick = (event) => {
    const link = event.target.closest("a");
    if (!link) return;

    trackGuideEvent("guide_click", guideType, {
      ...getCurrentCardParams(guideData, currentCardIndex),
      text: link.textContent || "",
    });
  };

  /**
   * Navigate to next or previous card with circular looping
   * @param {string} direction - Either "next" or "previous"
   */
  const navigateCard = (direction) => {
    if (!guideData || !guideData.cards.length) return;

    // Validate direction parameter
    if (direction !== "next" && direction !== "previous") {
      return;
    }

    const cardsLength = guideData.cards.length;
    let newIndex;

    if (direction === "next") {
      newIndex = currentCardIndex >= cardsLength - 1 ? 0 : currentCardIndex + 1;
    } else {
      newIndex = currentCardIndex <= 0 ? cardsLength - 1 : currentCardIndex - 1;
    }

    trackGuideEvent("guide_nav", guideType, {
      ...getCurrentCardParams(guideData, currentCardIndex),
      text: direction,
    });

    setCurrentCardIndex(newIndex);
  };

  // Don't render if user has already seen it or if not open
  if (!isVisible) return null;

  // Show loading state
  if (loading || !guideData) {
    return (
      <div className="guideOverlay">
        <div className="guideOverlayContent">
          <div className="guideOverlayLoadingCenter">
            <LoadingMessage />
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
                direction="previous"
                onClick={() => navigateCard("previous")}
                altText={localize("Previous card")}
              />
              <span className="cardsPaginationNumber">
                <InterfaceText>{`${currentCardIndex + 1} ${localize("of")} ${
                  guideData.cards.length
                }`}</InterfaceText>
              </span>
              <Arrow
                direction="next"
                onClick={() => navigateCard("next")}
                altText={localize("Next card")}
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
                  src={Sefaria._v(card.videoUrl)}
                  preload="auto"
                  style={{
                    display: index === currentCardIndex ? "block" : "none",
                  }}
                  className="guideOverlayVideo"
                  controls
                  loop
                  autoPlay
                  muted // Added to avoid autoplay issues with browsers
                  playsInline // Added to avoid autoplay issues on mobile (even though we will likely not show this on mobile)
                >
                  <InterfaceText>
                    {localize("Your browser does not support the video tag.")}
                  </InterfaceText>
                </video>
              ))}
            </div>

            {/* Scrollable text content - narrower width */}
            <div className="guideOverlayTextContainer">
              <div
                className="guideOverlayText"
                onClick={handleTextContentClick}
              >
                <InterfaceText
                  markdown={transformValues(currentCard.text, (text) =>
                    text.replace(/\n(?!\n)/g, "  \n")
                  )}
                  disallowedMarkdownElements={[]}
                />
              </div>
            </div>
          </div>

          {/* Footer with consistent links */}
          <GuideFooter
            links={guideData.footerLinks}
            onLinkClick={handleFooterLinkClick}
          />
        </div>
      </div>
    </div>
  );
};

GuideOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  guideType: PropTypes.string.isRequired,
  forceShow: PropTypes.bool,
  timeoutLength: PropTypes.number,
};

export default GuideOverlay;
