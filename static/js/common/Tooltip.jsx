import React, { useEffect, useRef } from 'react';
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

/**
 * Tooltip component that positions relative to a target element using Floating UI.
 * Renders in normal DOM flow alongside children.
 * 
 * Usage: Pass targetRef pointing to the element to position relative to.
 * Children are rendered normally, tooltip content goes in header/content props.
 */

// Configuration constants (kept consistent with existing ModuleSwitcherTooltip)
const PLACEMENT_CONFIG = {
  desktop: 'bottom',
  mobileHebrew: 'right',
  mobileEnglish: 'left',
};
const TOOLTIP_OFFSET = 10;

// Internal component for tooltip content and actions
const TooltipBody = ({ header, content, learnMore, confirm }) => {
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

  return (
    <div className="floating-ui-tooltip-content">
      {header && <div className="tooltip-header">{header}</div>}
      {content}
      {actions}
    </div>
  );
};

const Tooltip = ({
  targetRef,             // Required: React ref to the element to position relative to
  children,              // Optional: Content rendered in normal DOM flow (can contain target element)
  header,                // Optional: Header content (typically <InterfaceText>)
  content,               // Required: Main tooltip content (typically <InterfaceText>)
  learnMore,             // Optional: { href: string, label: ReactNode, newTab?: boolean }
  confirm,               // Optional: { label: ReactNode, onClick?: () => void }
  open = false,          // Required: Controls tooltip visibility (boolean)
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
    
    // Tell Floating UI which element to position relative to
    refs.setReference(targetRef.current);
    
    // Start auto-positioning when tooltip is open
    // autoUpdate returns a cleanup function that React calls to stop positioning
    // when tooltip closes, component unmounts, or dependencies change
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

  // Only create tooltip element when open and target exists
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
      <TooltipBody 
          header={header}
          content={content}
          learnMore={learnMore}
          confirm={confirm}
        />
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
      {tooltipElement}
    </>
  );
};

export default Tooltip;


