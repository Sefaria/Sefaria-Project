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

const ModuleSwitcherTooltip = ({ targetRef, children, multiPanel, mobileTargetRef }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const isMobile = !multiPanel;
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const arrowRef = useRef(null);

  const TOOLTIP_OFFSET = 50;
  const RTL_MULTIPLIER = isHebrew ? 1 : -1;

  // Get the appropriate target element based on mobile/desktop
  const targetElement = isMobile ? (mobileTargetRef || targetRef) : targetRef;

  // Set up floating-ui
  const { x, y, refs, strategy, middlewareData, update } = useFloating({
    placement: isMobile ? 'right' : 'top',
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 8 }),
      arrowMiddleware({ element: arrowRef }),
    ],
  });

  useEffect(() => {
    const dismissed = localStorage.getItem('sefaria.moduleSwitcherTooltipDismissed');
    if (dismissed !== 'true') {
      setTooltipVisible(true);
    }
  }, []);

  // Set reference element and enable auto-update positioning
  useEffect(() => {
    if (!targetElement?.current) return;
    refs.setReference(targetElement.current);
    if (!isTooltipVisible || !refs.floating.current) return;
    const cleanup = autoUpdate(
      targetElement.current,
      refs.floating.current,
      update
    );
    return cleanup;
  }, [isTooltipVisible, targetElement, refs, update]);

  const hideTooltip = () => {
    setTooltipVisible(false);
    localStorage.setItem('sefaria.moduleSwitcherTooltipDismissed', 'true');
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
        <button onClick={hideTooltip} className="tooltip-button">
          <InterfaceText text={{en: "Got it!", he: "הבנתי"}} />
        </button>
      </div>
    </div>
  );

  // Calculate arrow position
  const effectiveOffset = isMobile ? 0 : TOOLTIP_OFFSET * RTL_MULTIPLIER;
  const arrowX = middlewareData.arrow?.x - effectiveOffset;
  const arrowY = middlewareData.arrow?.y;
  const placement = middlewareData.placement || (isMobile ? 'right' : 'top');
  const staticSide = {
    top: 'top',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[placement.split('-')[0]];
  const arrowStyle = {
    left: arrowX !== undefined ? `${arrowX}px` : '',
    top: arrowY !== undefined ? `${arrowY}px` : '',
    [staticSide]: '-4px',
  };

  // Render tooltip in a portal
  const tooltipElement = isTooltipVisible && (
    <div
      ref={refs.setFloating}
      className={`floating-ui-tooltip${isHebrew ? ' interface-he' : ''}`}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x + effectiveOffset,
        width: 'max-content',
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
