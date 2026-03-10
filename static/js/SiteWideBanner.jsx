import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import $ from "./sefaria/sefariaJquery";
import Sefaria from "./sefaria/sefaria";

const SiteWideBanner = ({
  mainText,
  secondaryText,
  actionButtons,
  learnMoreUrl,
  learnMoreText,
  cookieName,
  bannerName,
}) => {
  const [bannerVisibility, setBannerVisibility] = useState("");

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

  const closeBanner = () => {
    setBannerVisibility("hidden");
    dismiss();
    trackBannerInteraction("close_clicked");
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
          {actionButtons}
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
        <button
          className="siteWideBannerClose"
          onClick={closeBanner}
          aria-label="Close banner"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

SiteWideBanner.propTypes = {
  mainText: PropTypes.string.isRequired,
  secondaryText: PropTypes.string,
  actionButtons: PropTypes.node.isRequired,
  learnMoreUrl: PropTypes.string,
  learnMoreText: PropTypes.string,
  cookieName: PropTypes.string.isRequired,
  bannerName: PropTypes.string.isRequired,
};

const CHATBOT_BANNER_MAIN_TEXT = "Try Sefaria's new Library Assistant (Experimental)";
const CHATBOT_BANNER_SECONDARY_TEXT = "Explore Jewish texts with our experimental AI-powered assistant.";
const CHATBOT_BANNER_LEARN_MORE_URL = "https://help.sefaria.org/hc/en-us/articles/26006423836828";

const ChatbotExperimentBanner = () => {
  const [isActionPending, setIsActionPending] = useState(false);

  const handleJoin = async () => {
    gtag("event", "banner_interacted_with_banner_button_clicked", {
      campaignID: "chatbot_experiment_opt_in",
      adType: "banner",
    });
    setIsActionPending(true);
    try {
      await Sefaria.experimentsOptInAPI()
        .catch(err => {
          alert("API call went wrong.");
          throw err;
        })
        .then(() => Sefaria.editProfileAPI({experiments: true}))
        .then(() => {
          window.location.reload();
          return new Promise(() => {}); // never resolves
        });
    } finally {
      setIsActionPending(false);
    }
  };

  const isLoggedIn = !!Sefaria._uid;
  const nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

  const actionButtons = isLoggedIn ? (
    <button className="button small" onClick={handleJoin} disabled={isActionPending}>
      <span>{isActionPending ? "Joining..." : "Join the Experiment"}</span>
    </button>
  ) : (<>
    <a className="button small" href={"/login" + nextParam}>
      <span>Log in to join</span>
    </a>
    <a className="button small white" href={"/register" + nextParam}>
      <span>Create an account</span>
    </a>
  </>);

  return (
    <SiteWideBanner
      mainText={CHATBOT_BANNER_MAIN_TEXT}
      secondaryText={CHATBOT_BANNER_SECONDARY_TEXT}
      actionButtons={actionButtons}
      learnMoreUrl={CHATBOT_BANNER_LEARN_MORE_URL}
      cookieName={isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"}
      bannerName={isLoggedIn ? "chatbot_experiment_opt_in" : "signup_promo"}
    />
  );
};

export { SiteWideBanner, ChatbotExperimentBanner };
