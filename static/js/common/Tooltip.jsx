import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow as arrowMiddleware,
} from '@floating-ui/react-dom';
import Button from './Button';
import Sefaria from '../sefaria/sefaria';

// Configuration constants (kept consistent with existing ModuleSwitcherTooltip)
const PLACEMENT_CONFIG = {
  desktop: 'bottom',
  mobileHebrew: 'right',
  mobileEnglish: 'left',
};
const TOOLTIP_OFFSET = 10;

const Tooltip = ({
  targetRef,
  children,
  header,                // ReactNode component - typically <InterfaceText>
  content,               // ReactNode component - typically <InterfaceText>
  learnMore,             // { href: string, label: ReactNode (typically <InterfaceText>), newTab?: boolean }
  confirm,               // { label: ReactNode (typically <InterfaceText>), onClick?: () => void }
  open = false,          // controlled visibility
}) => {
  const isMobile = !Sefaria.multiPanel;
  const TOOLTIP_SHIFT_PADDING = isMobile ? 10 : 45;
  const isHebrew = Sefaria.interfaceLang === 'hebrew';
  const arrowRef = useRef(null);

  // Resolve base placement based on device and language
  const basePlacement = isMobile
    ? (isHebrew ? PLACEMENT_CONFIG.mobileHebrew : PLACEMENT_CONFIG.mobileEnglish)
    : PLACEMENT_CONFIG.desktop;

  const { x, y, refs, strategy, middlewareData, update } = useFloating({
    placement: basePlacement,
    middleware: [
      offset(TOOLTIP_OFFSET),
      flip(),
      shift({ padding: TOOLTIP_SHIFT_PADDING }),
      arrowMiddleware({ element: arrowRef }),
    ],
  });

  // Set reference element and auto-update positioning while tooltip is open
  useEffect(() => {
    if (!targetRef?.current) return;
    
    refs.setReference(targetRef.current);
    
    if (open && refs.floating.current) {
      return autoUpdate(targetRef.current, refs.floating.current, update);
    }
  }, [open, targetRef, refs.setReference, refs.floating, update]);
  // Determine placement to help arrow class (fall back to base)
  const placement = middlewareData?.placement || basePlacement;

  // Determine CSS class name for arrow positioning
  const getArrowClassName = () => {
    if (isMobile && isHebrew && placement === 'right') {
      return 'mobile-hebrew-right';
    }
    if (isMobile && !isHebrew && placement === 'left') {
      return 'mobile-english-left';
    }
    return `desktop-${placement}`;
  };

  // Only dynamic position values are set inline
  const arrowDynamicStyle = {
    ...(middlewareData.arrow?.x != null && { left: `${middlewareData.arrow.x}px` }),
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  };

  const actions = (learnMore || confirm) && (
    <div className="tooltip-actions">
      {learnMore && (
        <a
          href={learnMore.href}
          target={!learnMore.newTab ? '_self' : '_blank'}
          rel={!learnMore.newTab ? undefined : 'noopener noreferrer'}
        >
          {learnMore.label}
        </a>
      )}
      {confirm && (
        <Button
          variant=""
          size="small"
          onClick={confirm.onClick}
          className="tooltip-button"
          activeModule={Sefaria.activeModule}
        >
          {confirm.label}
        </Button>
      )}
    </div>
  );

  const tooltipBody = (
    <div className="floating-ui-tooltip-content">
      {header && <div className="tooltip-header">{header}</div>}
      {content}
      {actions}
    </div>
  );

  const tooltipElement = open && targetRef?.current && (
    <div
      ref={refs.setFloating}
      className="floating-ui-tooltip"
      data-active-module={Sefaria.activeModule}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x ?? 0,
      }}
    >
      {tooltipBody}
      <div
        ref={arrowRef}
        className={`floating-ui-arrow ${getArrowClassName()}`}
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

export default Tooltip;


