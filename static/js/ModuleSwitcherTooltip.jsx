import React, { useEffect, useState } from 'react';
import ShowOnceTooltip from './common/ShowOnceTooltip';
import { InterfaceText } from './Misc';
import Sefaria from './sefaria/sefaria';

const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

// Strings corresponding to keys in static/js/sefaria/strings.js
const STRINGS = {
  HEADER: "Looking for something?",
  CONTENT: "We've updated the structure of our website! The Sefaria platform now has separate spaces for learning in the library, creating Torah content, and building digital Torah tools.",
  LEARN_MORE: "Learn More",
  CONFIRM: "Got it!",
};

const ModuleSwitcherTooltip = ({ targetRef, children }) => {
  const [isOpen, setOpen] = useState(false);

  // Show tooltip if not dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== 'true' && targetRef?.current) {
      setOpen(true);
    }
  }, [targetRef]);

  // Handle clicks on module switcher icon to hide tooltip
  useEffect(() => {
    if (!isOpen) return;

    const handleModuleSwitcherClick = (event) => {
      // Check if click is on the module switcher or mobile menu button
      const clickedElement = event.target;
      const isModuleSwitcherClick = clickedElement.closest('.headerDropdownMenu') || 
                                     clickedElement.closest('.menuButton');
      
      if (isModuleSwitcherClick) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleModuleSwitcherClick);
    document.addEventListener('touchstart', handleModuleSwitcherClick);

    return () => {
      document.removeEventListener('mousedown', handleModuleSwitcherClick);
      document.removeEventListener('touchstart', handleModuleSwitcherClick);
    };
  }, [isOpen]);

  return (
    <ShowOnceTooltip
      storageKey={STORAGE_KEY}
      targetRef={targetRef}
      open={isOpen}
      onOpenChange={setOpen}
      header={<InterfaceText>{STRINGS.HEADER}</InterfaceText>}
      content={<InterfaceText>{STRINGS.CONTENT}</InterfaceText>}
      learnMore={{
        // TODO: add the actual href
        href: 'https://www.sefaria.org/sheets/689609?lang=en',
        label: <InterfaceText>{STRINGS.LEARN_MORE}</InterfaceText>,
        newTab: true,
      }}
      confirm={{
        label: <InterfaceText>{STRINGS.CONFIRM}</InterfaceText>,
        onClick: () => {},
      }}
      activeModule={Sefaria.activeModule}
    >
      {children}
    </ShowOnceTooltip>
  );
};

export default ModuleSwitcherTooltip;