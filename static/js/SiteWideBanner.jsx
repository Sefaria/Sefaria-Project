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
  gtagParams,
}) => {
  const [bannerVisibility, setBannerVisibility] = useState("");

  useEffect(() => {
    gtag("event", "promo_viewed", gtagParams);
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

  const trackBannerInteraction = (feature_name) => {
    gtag("event", "promo_clicked", { ...gtagParams, feature_name });
  };

  const closeBanner = () => {
    setBannerVisibility("hidden");
    dismiss();
    trackBannerInteraction("close");
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
          {actionButtons(trackBannerInteraction)}
        </div>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            className="bannerLearnMore"
            target="_blank"
            onClick={() => trackBannerInteraction("learn_more")}
          >
            {learnMoreText || "Learn More"}
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
  actionButtons: PropTypes.func.isRequired,
  learnMoreUrl: PropTypes.string,
  learnMoreText: PropTypes.string,
  cookieName: PropTypes.string.isRequired,
  gtagParams: PropTypes.object.isRequired,
};

const CHATBOT_BANNER_MAIN_TEXT = "Try Sefaria's new Library Assistant (Experimental)";
const CHATBOT_BANNER_SECONDARY_TEXT = "Discover & explore texts in the Sefaria Library with our new AI-powered assistant.";
const CHATBOT_BANNER_LEARN_MORE_URL = "https://help.sefaria.org/hc/en-us/articles/26006423836828";
const CAMPAIGN_ID = "LA Stand Alone Promo";
const PROJECT = 'Library Assistant';

const ChatbotExperimentBanner = () => {
  const [isActionPending, setIsActionPending] = useState(false);

  const handleJoin = async () => {
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

  return (
    <SiteWideBanner
      mainText={CHATBOT_BANNER_MAIN_TEXT}
      secondaryText={CHATBOT_BANNER_SECONDARY_TEXT}
      actionButtons={(track) => isLoggedIn ? (
        <button className="button small" onClick={() => { track("join"); handleJoin(); }} disabled={isActionPending}>
          <span>{isActionPending ? "Joining..." : "Join the Experiment"}</span>
        </button>
      ) : (<>
        <a className="button small" href={"/login" + nextParam} onClick={() => track("login")}>
          <span>Log in to Join</span>
        </a>
        <a className="button small white" href={"/register" + nextParam} onClick={() => track("create_an_account")}>
          <span>Create an Account</span>
        </a>
      </>)}
      learnMoreUrl={CHATBOT_BANNER_LEARN_MORE_URL}
      cookieName={isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"}
      gtagParams={{ campaignID: CAMPAIGN_ID, project: PROJECT }}
    />
  );
};

export { SiteWideBanner, ChatbotExperimentBanner };
