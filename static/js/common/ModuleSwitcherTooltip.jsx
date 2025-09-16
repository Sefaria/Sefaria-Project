import React, { useState, useEffect } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText } from '../Misc';

const ModuleSwitcherTooltip = ({ targetRef, children }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('sefaria.moduleSwitcherTooltipDismissed');
    if (dismissed !== 'true') {
      setTooltipVisible(true);
    }
  }, []);

  const hideTooltip = () => {
    setTooltipVisible(false);
    localStorage.setItem('sefaria.moduleSwitcherTooltipDismissed', 'true');
  };

  const tooltipContent = (
    <div className="module-switcher-tooltip">
        <InterfaceText markdown={{
            en: `We made some changes to the structure of the Sefaria web platform. To better serve our different missions we present specialized areas for **learning** ("Library"), **creating** ("Voices"), and **extending** ("Developers") digital Torah. Welcome to the __Next 10 Years__ of Sefaria!`,
            he: `ערכנו כמה שינויים במבנה פלטפורמת האינטרנט של ספריא. כדי לשרת טוב יותר את שלל המשימות שלנו, אנו מציגים אזורים ייעודיים ל**לימוד** ("ספרייה"), **יצירה** ("קולות"), ו**הרחבה** ("מפתחים") של התורה הדיגיטלית. ברוכים הבאים ל־__עשר השנים הבאות__ של ספריא!`
        }} />
      <div className="module-switcher-tooltip-actions">
        <a href="https://example.com" target="_blank" rel="noopener noreferrer">
          <InterfaceText text={{en: "Learn more", he: "למידע נוסף"}} />
        </a>
        <button onClick={hideTooltip} className="module-switcher-tooltip-button">
          <InterfaceText text={{en: "Got it!", he: "הבנתי"}} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {children}
      <Tippy
        content={tooltipContent}
        visible={isTooltipVisible}
        placement="top"
        interactive={true}
        arrow={true}
        appendTo={() => document.body}
        reference={targetRef}
        className="module-switcher-tippy"
      />
    </>
  );
};

export default ModuleSwitcherTooltip;
