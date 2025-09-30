import React, { useState, useEffect, useRef } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { InterfaceText } from '../Misc';
import Sefaria from '../sefaria/sefaria';
import classNames from 'classnames';

const ModuleSwitcherTooltip = ({ targetRef, children, multiPanel, mobileTargetRef }) => {
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const isMobile = !multiPanel;
  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const tippyInstanceRef = useRef(null);

  useEffect(() => {
    const dismissed = localStorage.getItem('sefaria.moduleSwitcherTooltipDismissed');
    if (dismissed !== 'true') {
      // Delay showing tooltip by 200ms to allow banner to appear and settle
      setTimeout(() => {
        setTooltipVisible(true);
      }, 1000);
    }
  }, []);

  // Effect to handle tooltip repositioning when DOM changes (e.g., banner appears)
  useEffect(() => {
    if (!isTooltipVisible) return;

    const updateTooltipPosition = () => {
      const targetElement = isMobile ? (mobileTargetRef || targetRef) : targetRef;
      if (targetElement && targetElement.current && targetElement.current._tippy) {
        const el = targetElement.current;
        const { popperInstance } = el._tippy;

        if (popperInstance) {
          // Force update to recalculate position after DOM changes
          popperInstance.update();
        }
      }
    };

    // Use MutationObserver to detect specific DOM changes that might affect header positioning
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        // Check if the mutation affects elements that could impact header positioning
        if (mutation.type === 'childList') {
          Array.from(mutation.addedNodes).forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node is a banner or warning message
              if (node.classList && (
                node.classList.contains('globalWarningMessage') ||
                node.classList.contains('banner') ||
                node.classList.contains('notification-banner') ||
                node.className.includes('warning') ||
                node.className.includes('banner')
              )) {
                shouldUpdate = true;
              }
            }
          });
        }

        // Also check for style changes that might affect positioning
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          if (target.classList && (
            target.classList.contains('header') ||
            target.classList.contains('globalWarningMessage') ||
            target.className.includes('banner')
          )) {
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        // Debounce the update to avoid excessive calls
        setTimeout(updateTooltipPosition, 150);
      }
    });

    // Observe changes to the body and header-related elements
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // Also listen for window resize events which might affect positioning
    const handleResize = () => {
      setTimeout(updateTooltipPosition, 100);
    };
    window.addEventListener('resize', handleResize);

    // Set up an interval to periodically check and update position
    // This helps catch cases where banners animate in or change height
    const interval = setInterval(() => {
      if (document.querySelector('.globalWarningMessage, .banner, .notification-banner')) {
        updateTooltipPosition();
      }
    }, 1000);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      clearInterval(interval);
    };
  }, [isTooltipVisible, isMobile, mobileTargetRef, targetRef]);

  // Get the appropriate target element based on mobile/desktop
  const targetElement = isMobile ? (mobileTargetRef || targetRef) : targetRef;

  const hideTooltip = () => {
    setTooltipVisible(false);
    localStorage.setItem('sefaria.moduleSwitcherTooltipDismissed', 'true');
  };

  const tooltipContent = (
    <div className="module-switcher-tooltip">
        <InterfaceText markdown={{
            en: `PLACEHOLDER TEXT: We made some changes to the structure of the Sefaria web platform. To better serve our different missions we present specialized areas for **learning** ("Library"), **creating** ("Voices"), and **extending** ("Developers") digital Torah. Welcome to the __Next 10 Years__ of Sefaria! PLACEHOLDER & Draft Styles`,
            he: `טיוטה: ערכנו כמה שינויים במבנה פלטפורמת האינטרנט של ספריא. כדי לשרת טוב יותר את שלל המשימות שלנו, אנו מציגים אזורים ייעודיים ל**לימוד** ("ספרייה"), **יצירה** ("קולות"), ו**הרחבה** ("מפתחים") של התורה הדיגיטלית. ברוכים הבאים ל־__עשר השנים הבאות__ של ספריא!`
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
        placement={isMobile ? "right" : "top"}
        interactive={true}
        arrow={true}
        appendTo={() => document.body}
        reference={targetElement}
        className={classNames("module-switcher-tippy", {"interface-he": isHebrew})}
        onCreate={(instance) => {
          tippyInstanceRef.current = instance;
        }}
      />
    </>
  );
};

export default ModuleSwitcherTooltip;
