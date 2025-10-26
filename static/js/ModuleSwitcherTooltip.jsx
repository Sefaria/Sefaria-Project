import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Button from './common/Button';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow as arrowMiddleware,
} from '@floating-ui/react-dom';
import { InterfaceText } from './Misc';
import Sefaria from './sefaria/sefaria';

// Configuration constants
const PLACEMENT_CONFIG = {
  desktop: 'bottom',
  mobileHebrew: 'right',
  mobileEnglish: 'left',
};

const TOOLTIP_OFFSET = 10;
const TOOLTIP_SHIFT_PADDING = 8;
const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

const ModuleSwitcherTooltip = ({ targetRef, children }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const isMobile = !Sefaria.multiPanel;
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const arrowRef = useRef(null);

  // Setup floating-ui
  const { x, y, refs, strategy, middlewareData, update } = useFloating({
    placement: isMobile 
      ? (isHebrew ? PLACEMENT_CONFIG.mobileHebrew : PLACEMENT_CONFIG.mobileEnglish) 
      : PLACEMENT_CONFIG.desktop,
    middleware: [
      offset(TOOLTIP_OFFSET),
      flip(),
      shift({ padding: TOOLTIP_SHIFT_PADDING }),
      arrowMiddleware({ element: arrowRef }),
    ],
  });

  // Show tooltip if not dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== 'true' && targetRef?.current) {
      setTooltipVisible(true);
    }
  }, [targetRef]);

  // Set reference element
  useEffect(() => {
    if (targetRef?.current) {
      refs.setReference(targetRef.current);
    }
  }, [targetRef, refs]);

  // Auto-update positioning
  useEffect(() => {
    if (isTooltipVisible && targetRef?.current && refs.floating.current) {
      return autoUpdate(targetRef.current, refs.floating.current, update);
    }
  }, [isTooltipVisible, targetRef, refs.floating.current, update]);

  // After setTooltipVisible(true) is called, force an update in a useEffect
  useEffect(() => {
    if (isTooltipVisible && update) {
      update();
    }
  }, [isTooltipVisible, update]);

  // Handle clicks outside the tooltip to hide it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isTooltipVisible && refs.floating.current) {
        const tooltipEl = refs.floating.current;

        // Check if click is outside the tooltip only
        if (!tooltipEl.contains(event.target)) {
          hideTooltip();
        }
      }
    };

    if (isTooltipVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isTooltipVisible, refs.floating]);

  const hideTooltip = () => {
    setTooltipVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  // Get the actual placement used by floating-ui, or fall back to our default config
  const placement = middlewareData.placement || (isMobile 
    ? (isHebrew ? PLACEMENT_CONFIG.mobileHebrew : PLACEMENT_CONFIG.mobileEnglish) 
    : PLACEMENT_CONFIG.desktop);

  // Determine CSS class name for arrow positioning based on device type, placement, and language
  const getArrowClassName = () => {
    if (isMobile && isHebrew && placement === 'right') {
      return 'floating-ui-arrow mobile-hebrew-right';
    }
    if (isMobile && !isHebrew && placement === 'left') {
      return 'floating-ui-arrow mobile-english-left';
    }
    // Desktop: use placement-based class
    return `floating-ui-arrow desktop-${placement}`;
  };

  // Only use inline styles for dynamic positioning calculated by floating-ui
  const arrowDynamicStyle = {
    ...(middlewareData.arrow?.x != null && { left: `${middlewareData.arrow.x}px` }),
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  };

  const tooltipContent = (
    <div>
      <InterfaceText markdown={{
        en: `PLACEHOLDER TEXT: We made some changes to the structure of the Sefaria web platform. To better serve our different missions we present specialized areas for **learning** ("Library"), **creating** ("Voices"), and **extending** ("Developers") digital Torah. Welcome to the __Next 10 Years__ of Sefaria! PLACEHOLDER & Draft Styles`,
        he: `טיוטה: ערכנו כמה שינויים במבנה פלטפורמת האינטרנט של ספריא. כדי לשרת טוב יותר את שלל המשימות שלנו, אנו מציגים אזורים ייעודיים ל**לימוד** ("ספרייה"), **יצירה** ("קולות"), ו**הרחבה** ("מפתחים") של התורה הדיגיטלית. ברוכים הבאים ל־__עשר השנים הבאות__ של ספריא!`
      }} /> 
      <div className="tooltip-actions">
        <a href="https://example.com" target="_blank" rel="noopener noreferrer">
          <InterfaceText text={{en: "Learn more", he: "למידע נוסף"}} />
        </a>
        <Button variant="" size="small" onClick={hideTooltip} className="tooltip-button">
          <InterfaceText text={{en: "Got it!", he: "הבנתי"}} />
        </Button>
      </div>
    </div>
  );

  const tooltipElement = isTooltipVisible && targetRef?.current && (
    <div
      ref={refs.setFloating}
      className={`floating-ui-tooltip`}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x ?? 0,
      }}
    >
      <div className="floating-ui-tooltip-content">
        {tooltipContent}
      </div>
      <div
        ref={arrowRef}
        className={getArrowClassName()}
        style={arrowDynamicStyle}
      />
    </div>
  );

  return (
    <>
      {children}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        tooltipElement,
        document.body
      )}
    </>
  );
};

export default ModuleSwitcherTooltip;