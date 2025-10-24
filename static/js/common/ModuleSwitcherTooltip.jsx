import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow as arrowMiddleware,
} from '@floating-ui/react-dom';
import { InterfaceText } from '../Misc';
import Sefaria from '../sefaria/sefaria';

// Configuration constants
const PLACEMENT_CONFIG = {
  desktop: 'bottom',
  mobileHebrew: 'right',
  mobileEnglish: 'left',
};

const ARROW_OFFSET_OUTSIDE = '-4px';
const TOOLTIP_OFFSET = 10;
const TOOLTIP_SHIFT_PADDING = 8;
const TOOLTIP_Z_INDEX = 9999;
const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

// Arrow style configuration based on placement and language
const ARROW_STYLE_CONFIG = {
  mobileHebrewRight: (middlewareData) => ({
    position: 'absolute',
    right: ARROW_OFFSET_OUTSIDE,
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  }),
  mobileEnglishLeft: (middlewareData) => ({
    position: 'absolute',
    left: ARROW_OFFSET_OUTSIDE,
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  }),
  desktop: (middlewareData, placement) => {
    const staticSide = {
      top: 'bottom',
      right: 'left',
      bottom: 'top',
      left: 'right',
    }[placement];
    
    return {
      position: 'absolute',
      ...(middlewareData.arrow?.x != null && { left: `${middlewareData.arrow.x}px` }),
      ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
      [staticSide]: ARROW_OFFSET_OUTSIDE,
    };
  },
};

const ModuleSwitcherTooltip = ({ targetRef, children, multiPanel, mobileTargetRef }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const isMobile = !multiPanel;
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const arrowRef = useRef(null);

  // Get target element
  const targetElement = isMobile ? (mobileTargetRef || targetRef) : targetRef;

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
    if (dismissed !== 'true' && targetElement?.current) {
      setTooltipVisible(true);
    }
  }, [targetElement]);

  // Set reference element
  useEffect(() => {
    if (targetElement?.current) {
      refs.setReference(targetElement.current);
    }
  }, [targetElement, refs]);

  // Auto-update positioning
  useEffect(() => {
    if (isTooltipVisible && targetElement?.current && refs.floating.current) {
      return autoUpdate(targetElement.current, refs.floating.current, update);
    }
  }, [isTooltipVisible, targetElement, refs.floating.current, update]);

  // After setTooltipVisible(true) is called, force an update in a useEffect
  useEffect(() => {
    if (isTooltipVisible && update) {
      update();
    }
  }, [isTooltipVisible, update]);

  const hideTooltip = () => {
    setTooltipVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  // Calculate arrow position based on placement
  const placement = middlewareData.placement || (isMobile 
    ? (isHebrew ? PLACEMENT_CONFIG.mobileHebrew : PLACEMENT_CONFIG.mobileEnglish) 
    : PLACEMENT_CONFIG.desktop);

  // Calculate arrow position using modern functional approach
  const getArrowConfigKey = () => {
    const conditions = [
      [isMobile && placement === 'right' && isHebrew, 'mobileHebrewRight'],
      [isMobile && placement === 'left' && !isHebrew, 'mobileEnglishLeft'],
      [true, 'desktop'], // fallback
    ];
    
    return conditions.find(([condition]) => condition)?.[1];
  };

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
        <button onClick={hideTooltip} className="tooltip-button">
          <InterfaceText text={{en: "Got it!", he: "הבנתי"}} />
        </button>
      </div>
    </div>
  );

  const tooltipElement = isTooltipVisible && targetElement?.current && (
    <div
      ref={refs.setFloating}
      className={`floating-ui-tooltip${isHebrew ? ' interface-he' : ''}`}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x ?? 0,
        zIndex: TOOLTIP_Z_INDEX,
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