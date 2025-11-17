import React, { useEffect, useMemo, useRef } from 'react';
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
import { InterfaceText } from '../Misc';
import Sefaria from '../sefaria/sefaria';

// Configuration constants (kept consistent with existing ModuleSwitcherTooltip)
const PLACEMENT_CONFIG = {
  desktop: 'bottom',
  mobileHebrew: 'right',
  mobileEnglish: 'left',
};
const TOOLTIP_OFFSET = 10;
const getTooltipShiftPadding = (isMobile) => (isMobile ? 10 : 45);

const Tooltip = ({
  targetRef,
  children,
  header,                // ReactNode or { text?: {en,he}, markdown?: {en,he} }
  content,               // ReactNode or { text?: {en,he}, markdown?: {en,he} } (required)
  learnMore,             // { href: string, label?: {en,he}, newTab?: boolean }
  confirm,               // { label?: {en,he}, onClick?: () => void }
  open = false,          // controlled visibility
  activeModule,          // 'library' | 'voices' (defaults to Sefaria.activeModule)
}) => {
  const isMobile = !Sefaria.multiPanel;
  const isHebrew = Sefaria.interfaceLang === 'hebrew';
  const arrowRef = useRef(null);
  const resolvedActiveModule = activeModule || Sefaria.activeModule;

  // Resolve base placement based on device and language
  const basePlacement = useMemo(() => {
    return isMobile
      ? (isHebrew ? PLACEMENT_CONFIG.mobileHebrew : PLACEMENT_CONFIG.mobileEnglish)
      : PLACEMENT_CONFIG.desktop;
  }, [isMobile, isHebrew]);

  const { x, y, refs, strategy, middlewareData, update } = useFloating({
    placement: basePlacement,
    middleware: [
      offset(TOOLTIP_OFFSET),
      flip(),
      shift({ padding: getTooltipShiftPadding(isMobile) }),
      arrowMiddleware({ element: arrowRef }),
    ],
  });

  // Set reference element from trigger ref
  useEffect(() => {
    if (targetRef?.current) {
      refs.setReference(targetRef.current);
    }
  }, [targetRef, refs]);

  // Auto-update positioning while tooltip is open
  useEffect(() => {
    if (open && targetRef?.current && refs.floating.current) {
      return autoUpdate(targetRef.current, refs.floating.current, update);
    }
  }, [open, targetRef, refs.floating, update]);

  // Force an update after becoming visible
  useEffect(() => {
    if (open && update) {
      update();
    }
  }, [open, update]);

  // Determine placement to help arrow class (fall back to base)
  const placement = middlewareData?.placement || basePlacement;

  // Determine CSS class name for arrow positioning
  const getArrowClassName = () => {
    if (isMobile && isHebrew && placement === 'right') {
      return 'floating-ui-arrow mobile-hebrew-right';
    }
    if (isMobile && !isHebrew && placement === 'left') {
      return 'floating-ui-arrow mobile-english-left';
    }
    return `floating-ui-arrow desktop-${placement}`;
  };

  // Only dynamic position values are set inline
  const arrowDynamicStyle = {
    ...(middlewareData.arrow?.x != null && { left: `${middlewareData.arrow.x}px` }),
    ...(middlewareData.arrow?.y != null && { top: `${middlewareData.arrow.y}px` }),
  };

  const renderContent = (value) => {
    if (React.isValidElement(value)) {
      return value;
    }
    if (!value) { 
      return null; 
    }
    if (value.markdown) {
      return <InterfaceText markdown={value.markdown} />;
    }
    if (value.text) {
      return <InterfaceText text={value.text} />;
    }
    // If it's a locale object with en/he properties, render as text
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'en') && Object.prototype.hasOwnProperty.call(value, 'he')) {
      return <InterfaceText text={value} />;
    }
    // Fallback: treat as raw node/string
    return value;
  };

  const actions = (learnMore || confirm) ? (
    <div className="tooltip-actions">
      {learnMore ? (
        <a
          href={learnMore.href}
          target={learnMore.newTab === false ? '_self' : '_blank'}
          rel={learnMore.newTab === false ? undefined : 'noopener noreferrer'}
        >
          {renderContent(learnMore.label) || <InterfaceText text={{ en: 'Learn more', he: 'למידע נוסף' }} />}
        </a>
      ) : <span />}
      {confirm ? (
        <Button
          variant=""
          size="small"
          onClick={confirm.onClick}
          className="tooltip-button"
          activeModule={resolvedActiveModule}
        >
          {renderContent(confirm.label) || <InterfaceText text={{ en: 'Got it!', he: 'הבנתי' }} />}
        </Button>
      ) : null}
    </div>
  ) : null;

  const tooltipBody = (
    <div className="floating-ui-tooltip-content">
      {header ? <div className="tooltip-header">{renderContent(header)}</div> : null}
      {renderContent(content)}
      {actions}
    </div>
  );

  const tooltipElement = open && targetRef?.current && (
    <div
      ref={refs.setFloating}
      className="floating-ui-tooltip"
      data-active-module={resolvedActiveModule}
      style={{
        position: strategy,
        top: y ?? 0,
        left: x ?? 0,
      }}
    >
      {tooltipBody}
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

export default Tooltip;


