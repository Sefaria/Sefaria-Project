import React, { useEffect, useState } from 'react';
import ShowOnceTooltip from './common/ShowOnceTooltip';
import { InterfaceText } from './Misc';
import Sefaria from './sefaria/sefaria';

const STORAGE_KEY = 'sefaria.moduleSwitcherTooltipDismissed';

const ModuleSwitcherTooltip = ({ targetRef, children }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);

  // Show tooltip if not dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed !== 'true' && targetRef?.current) {
      setTooltipVisible(true);
    }
  }, [targetRef]);

  // Handle clicks on module switcher icon to hide tooltip
  useEffect(() => {
    const handleModuleSwitcherClick = (event) => {
      if (!isTooltipVisible) return;
      
      // Check if click is on the module switcher or mobile menu button
      const clickedElement = event.target;
      const isModuleSwitcherClick = clickedElement.closest('.headerDropdownMenu') || 
                                     clickedElement.closest('.menuButton');
      
      if (isModuleSwitcherClick) {
        setTooltipVisible(false);
      }
    };

    if (isTooltipVisible) {
      document.addEventListener('mousedown', handleModuleSwitcherClick);
      document.addEventListener('touchstart', handleModuleSwitcherClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleModuleSwitcherClick);
      document.removeEventListener('touchstart', handleModuleSwitcherClick);
    };
  }, [isTooltipVisible]);

  return (
    <ShowOnceTooltip
      storageKey={STORAGE_KEY}
      targetRef={targetRef}
      open={isTooltipVisible}
      onOpenChange={setTooltipVisible}
      // Optional header can be provided here if desired in future
      header={{ text: { en: 'Looking for something?', he: 'מחפשים משהו?' } }}
      content={{
        markdown: {
          en: `We’ve updated the structure of our website! The Sefaria platform now has separate spaces for learning in the library, creating Torah content, and building digital Torah tools.`,
          he: `ערכנו שינויים במבנה של ספריא. לחצו כאן כדי לגלות את המודולים החדשים בשביל לימוד, יצירה והרחבה של תורה דיגיטלית.`,
        },
      }}
      learnMore={{
        href: 'https://www.sefaria.org/sheets/689609?lang=en',
        label: { en: 'Learn more', he: 'למידע נוסף' },
        newTab: true,
      }}
      confirm={{
        label: { en: 'Got it!', he: 'הבנתי' },
        onClick: () => {}, // actual dismissal handled by ShowOnceTooltip via onOpenChange
      }}
      activeModule={Sefaria.activeModule}
    >
      {children}
    </ShowOnceTooltip>
  );
};

export default ModuleSwitcherTooltip;