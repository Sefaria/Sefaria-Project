import React, { useEffect, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent, PopoverClose } from './common/Popover';
import { InterfaceText } from './Misc';
import Button from './common/Button';
import Sefaria from './sefaria/sefaria';

/**
 * Module Switcher onboarding popover that explains the new website structure.
 * 
 * Features:
 * - Shows once per user (persisted in localStorage)
 * - Appears on page load if not previously dismissed
 * - Auto-closes when user clicks the module switcher or mobile menu
 * - Contains informational content with "Learn More" link and dismiss button
 */

// localStorage key for tracking dismissal
const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

// Text content (keys correspond to sefaria/strings.js)
const STRINGS = {
  HEADER: "Looking for something?",
  CONTENT: "We made some changes to the structure of the Sefaria website. Click here to discover our new modules for learning, creating and extending digital Torah.",
  LEARN_MORE: "Learn More",
  CONFIRM: "Got it!",
};

const ModuleSwitcherPopover = ({ children }) => {
  const [isOpen, setOpen] = useState(false);

  // Show popover on component mount if user hasn't dismissed it before
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== 'true') {
      setOpen(true);
    }
  }, []);

  // Auto-close popover when user interacts with module switcher or mobile menu
  // This provides a natural dismissal when user starts exploring the interface
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (event) => {
      // Check if click is on module switcher dropdown or mobile menu button
      const isModuleSwitcherClick = 
        event.target.closest('.headerDropdownMenu') || 
        event.target.closest('.menuButton');
      
      if (isModuleSwitcherClick) {
        setOpen(false);
      }
    };

    // Listen for both mouse and touch events for mobile compatibility
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [isOpen]);

  // Handle popover close with localStorage persistence
  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    // Save dismissal to localStorage when closing
    if (!nextOpen) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  };

  return (
    <Popover open={isOpen} handleOpen={handleOpenChange}>
      {/* Trigger: The element that the popover points to (module switcher button) */}
      <PopoverTrigger>
        {children}
      </PopoverTrigger>
      
      {/* Content: The actual popover with onboarding message */}
      <PopoverContent>
        <div className="floating-ui-popover-content">
          {/* Header text */}
          <div className="popover-header">
            <InterfaceText>{STRINGS.HEADER}</InterfaceText>
          </div>
          
          {/* Main explanatory content */}
          <InterfaceText>{STRINGS.CONTENT}</InterfaceText>
          
          {/* Action buttons */}
          <div className="popover-actions">
            {/* External link to learn more */}
            <Button
              className="learn-more accessible-touch-target"
              href={Sefaria.util.fullURL(Sefaria._siteSettings?.MODULE_SWITCHER_LEARN_MORE_PATH, Sefaria.VOICES_MODULE)}
              target="_blank"
              targetModule={Sefaria.VOICES_MODULE}
            >
              <InterfaceText>{STRINGS.LEARN_MORE}</InterfaceText>
            </Button>
            
            {/* Dismiss button that closes popover and saves to localStorage */}
            <PopoverClose className="accessible-touch-target">
              <InterfaceText>{STRINGS.CONFIRM}</InterfaceText>
            </PopoverClose>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ModuleSwitcherPopover;

