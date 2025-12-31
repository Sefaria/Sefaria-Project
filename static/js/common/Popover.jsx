import React, { createContext, useContext, useRef } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow as arrowMiddleware,
} from '@floating-ui/react-dom';
import Sefaria from '../sefaria/sefaria';
import Button from './Button';

/**
 * Simple Popover implementation following Floating UI best practices.
 * 
 * This is a controlled component that requires:
 * - `open`: boolean to control visibility
 * - `handleOpen`: callback when open state should change
 * 
 * Usage:
 * <Popover open={isOpen} handleOpen={setIsOpen}>
 *   <PopoverTrigger>
 *     <button>Click me</button>
 *   </PopoverTrigger>
 *   <PopoverContent>
 *     Popover content here
 *   </PopoverContent>
 * </Popover>
 */

const TOOLTIP_OFFSET = 10;

// React Context to share popover state and positioning data between components
const PopoverContext = createContext(null);

export const usePopoverContext = () => {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error('Popover components must be wrapped in <Popover />');
  }
  return context;
};

/**
 * Determines optimal popover placement based on device type and interface language.
 * - Desktop/Tablet: Always bottom
 * - Mobile Hebrew: Right (to avoid RTL text collision)
 * - Mobile English: Left (natural LTR flow)
 */
const getPlacement = () => {
  const isMobile = Sefaria.getBreakpoint() === Sefaria.breakpoints.MOBILE;
  if (isMobile) {
    return Sefaria.interfaceLang === 'hebrew' ? 'right' : 'left';
  }
  return 'bottom';
};

/**
 * Main Popover component that sets up positioning and provides context.
 * This is the root component that manages all popover state and positioning logic.
 */
export const Popover = ({ children, open = false, handleOpen }) => {
  const arrowRef = useRef(null);
  const isMobile = Sefaria.getBreakpoint() === Sefaria.breakpoints.MOBILE;
  const placement = getPlacement();

  // Floating UI hook handles all positioning logic
  const { x, y, refs, strategy, middlewareData } = useFloating({
    open,
    handleOpen,
    placement,
    middleware: [
      offset(TOOLTIP_OFFSET),           // Add space between trigger and popover
      flip(),                          // Flip to opposite side if no space
      shift({ padding: isMobile ? 10 : 45 }), // Shift within viewport bounds
      arrowMiddleware({ element: arrowRef }),  // Position arrow element
    ],
    whileElementsMounted: autoUpdate,  // Auto-update position when elements move
  });

  // Context value shared with all child components
  const value = {
    open,
    setOpen: handleOpen,
    refs,                              // Reference setters for trigger and floating elements
    floatingStyles: {                  // Computed styles for positioning
      position: strategy,              // 'absolute' or 'fixed'
      top: y ?? 0,
      left: x ?? 0,
    },
    arrowRef,                          // Ref for arrow element
    arrowX: middlewareData.arrow?.x,   // Arrow X position
    arrowY: middlewareData.arrow?.y,   // Arrow Y position
    placement: middlewareData?.placement || placement, // Final computed placement
  };

  return (
    <PopoverContext.Provider value={value}>
      {children}
    </PopoverContext.Provider>
  );
};

/**
 * Wrapper for the trigger element (button, link, etc.) that opens the popover.
 * This component sets up the reference for Floating UI positioning.
 */
export const PopoverTrigger = ({ children }) => {
  const { refs } = usePopoverContext();
  return (
    <div ref={refs.setReference}>
      {children}
    </div>
  );
};

/**
 * The actual popover content that appears when open.
 * Includes automatic arrow positioning and responsive placement.
 */
export const PopoverContent = ({ children, className = '' }) => {
  const { open, refs, floatingStyles, arrowRef, arrowX, arrowY, placement } = usePopoverContext();
  const isMobile = Sefaria.getBreakpoint() === Sefaria.breakpoints.MOBILE;
  const isHebrew = Sefaria.interfaceLang === 'hebrew';

  // Don't render anything when closed
  if (!open) return null;

  // Determine arrow CSS class based on final placement and device/language
  let arrowClass;
  if (isMobile && isHebrew && placement === 'right') {
    arrowClass = 'mobile-hebrew-right';
  } else if (isMobile && !isHebrew && placement === 'left') {
    arrowClass = 'mobile-english-left';
  } else {
    // Desktop or other placements use desktop- prefix
    arrowClass = `desktop-${placement}`;
  }

  // Arrow positioning styles (computed by Floating UI)
  const arrowStyle = {
    ...(arrowX != null && { left: `${arrowX}px` }),
    ...(arrowY != null && { top: `${arrowY}px` }),
  };

  return (
    <div
      ref={refs.setFloating}
      className={`floating-ui-popover ${className}`}
      data-active-module={Sefaria.activeModule}
      style={floatingStyles}
    >
      {children}
      {/* Arrow element positioned by Floating UI */}
      <div
        ref={arrowRef}
        className={`floating-ui-arrow ${arrowClass}`}
        style={arrowStyle}
      />
    </div>
  );
};

/**
 * Button component that closes the popover when clicked.
 * Uses the project's Button component with consistent styling.
 * Automatically calls the popover's setOpen(false) in addition to any custom onClick handler.
 */
export const PopoverClose = ({ children, onClick, className = '', ...props }) => {
  const { setOpen } = usePopoverContext();

  return (
    <Button
      variant=""
      size="small"
      activeModule={Sefaria.activeModule}
      className={`popover-button ${className}`}
      onClick={(e) => {
        onClick?.(e);        // Call custom handler first
        setOpen?.(false);    // Then close the popover
      }}
      {...props}
    >
      {children}
    </Button>
  );
};

export default Popover;

