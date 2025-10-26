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

const ARROW_OFFSET_OUTSIDE = '-4px';
const TOOLTIP_OFFSET = 10;
const TOOLTIP_SHIFT_PADDING = 8;
const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

// Arrow style configuration based on placement and language
// Each function returns CSS styles for positioning the tooltip arrow
const ARROW_STYLE_CONFIG = {
  // For Hebrew mobile interface: tooltip appears on right side, arrow points left
  mobileHebrewRight: (middlewareData) => ({
    position: 'absolute',
    right: ARROW_OFFSET_OUTSIDE, // Position arrow outside the tooltip border
    // Use floating-ui calculated Y position for vertical centering
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  }),
  // For English mobile interface: tooltip appears on left side, arrow points right
  mobileEnglishLeft: (middlewareData) => ({
    position: 'absolute',
    left: ARROW_OFFSET_OUTSIDE, // Position arrow outside the tooltip border
    // Use floating-ui calculated Y position for vertical centering
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  }),
  // For desktop: tooltip can appear on any side, arrow adapts accordingly
  desktop: (middlewareData, placement) => {
    // Map tooltip placement to the opposite side for arrow positioning
    // e.g., if tooltip is on 'bottom', arrow should be on 'top' of tooltip
    const staticSide = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right',
    }[placement];
    
    return {
      position: 'absolute',
      // Use floating-ui calculated positions for precise arrow placement
      ...(middlewareData.arrow?.x != null && { left: `${middlewareData.arrow.x}px` }),
      ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
      // Position arrow outside the tooltip on the appropriate side
      [staticSide]: ARROW_OFFSET_OUTSIDE,
    };
  },
};

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

  // Determine which arrow style configuration to use based on device type, placement, and language
  // Uses a functional approach with condition-value pairs for clean logic flow
  const getArrowConfigKey = () => {
    const conditions = [
      // Hebrew mobile: tooltip on right, arrow points left
      [isMobile && placement === 'right' && isHebrew, 'mobileHebrewRight'],
      // English mobile: tooltip on left, arrow points right
      [isMobile && placement === 'left' && !isHebrew, 'mobileEnglishLeft'],
      // Desktop or any other case: use adaptive desktop configuration
      [true, 'desktop'], // fallback
    ];
    
    // Find the first condition that matches and return its corresponding config key
    return conditions.find(([condition]) => condition)?.[1];
  };

  // Get the appropriate arrow style factory function and generate the CSS styles
  const configKey = getArrowConfigKey();
  const arrowStyleFactory = ARROW_STYLE_CONFIG[configKey];
  const arrowStyle = arrowStyleFactory(middlewareData, placement);

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
        className="floating-ui-arrow"
        style={arrowStyle}
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