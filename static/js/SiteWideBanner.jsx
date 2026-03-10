import React, { useState, useEffect } from "react";
import $ from "./sefaria/sefariaJquery";
import Sefaria from "./sefaria/sefaria";

const SiteWideBanner = ({
  mainText,
  secondaryText,
  actionButtonText,
  actionButtonPendingText,
  onActionClick,
  learnMoreUrl,
  learnMoreText,
  cookieName,
  bannerName,
}) => {
  const [bannerVisibility, setBannerVisibility] = useState("");
  const [isActionPending, setIsActionPending] = useState(false);

  useEffect(() => {
    gtag("event", "banner_viewed", {
      campaignID: bannerName,
      adType: "banner",
    });
  }, []);

  const isDismissed = () => {
    return document.cookie.includes(cookieName);
  };

  const dismiss = () => {
    const cookieDomain = Sefaria.util.getCookieDomain();
    const cookieOptions = { path: "/", expires: 20 * 365 };
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }
    $.cookie(cookieName, 1, cookieOptions);
  };


  const trackBannerInteraction = (eventDescription) => {
    gtag("event", `banner_interacted_with_${eventDescription}`, {
      campaignID: bannerName,
      adType: "banner",
    });
  };

  const closeBanner = (eventDescription) => {
    setBannerVisibility("hidden");
    dismiss();
    trackBannerInteraction(eventDescription);
  };

  const handleAction = async () => {
    trackBannerInteraction("banner_button_clicked");
    if (onActionClick) {
      setIsActionPending(true);
      try {
        await onActionClick();
      } finally {
        setIsActionPending(false);
      }
    }
  };


  return (!isDismissed() &&
    <div className={`siteWideBanner ${bannerVisibility}`}>
      <div className="siteWideBannerContent">
        <div className="siteWideBannerTextBox">
          <span className="bannerMainText">{mainText}</span>
          {secondaryText && (
            <span className="bannerSecondaryText">{secondaryText}</span>
          )}
        </div>
        <div className="siteWideBannerButtonBox">
          <button className="button small" onClick={handleAction} disabled={isActionPending}>
            <span>{isActionPending ? actionButtonPendingText : actionButtonText}</span>
          </button>
        </div>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            className="bannerLearnMore"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackBannerInteraction("learn_more_clicked")}
          >
            {learnMoreText || "Learn more"}
          </a>
        )}
      </div>
      <button
        className="siteWideBannerClose"
        onClick={() => closeBanner("close_clicked")}
        aria-label="Close banner"
      >
        &times;
      </button>
    </div>
  );
};

export { SiteWideBanner };
