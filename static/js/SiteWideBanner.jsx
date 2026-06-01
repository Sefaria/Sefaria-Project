import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import $ from "./sefaria/sefariaJquery";
import Sefaria from "./sefaria/sefaria";

const DEFAULT_PROMO_SESSION_LENGTH_SECONDS = 30 * 60;
const MAX_MAYBE_LATER_CLICKS = 3;
const NUDGE_SCHEDULE = {
  1: { sessions: 2, days: 7 },
  2: { sessions: 4, days: 21 },
};

const getPromoStorageKeys = (cookieName) => {
  const storagePrefix = `promo_backoff_${cookieName}`;
  return {
    state: `${storagePrefix}_state`,
    sessionCounter: `${storagePrefix}_session_counter`,
    lastSessionAtSec: `${storagePrefix}_last_session_at_sec`,
  };
};

const getPromoSessionLengthSeconds = (remoteConfig) => {
  const configuredSessionLengthSeconds = Number(remoteConfig?.chatbotPromo?.sessionLengthSeconds);
  return Number.isFinite(configuredSessionLengthSeconds) && configuredSessionLengthSeconds > 0
    ? configuredSessionLengthSeconds
    : DEFAULT_PROMO_SESSION_LENGTH_SECONDS;
};

const updatePromoSessionCounter = ({ storageKeys, sessionLengthSeconds }) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const lastSessionAtSec = Number(localStorage.getItem(storageKeys.lastSessionAtSec));
  const currentSessionCounter = Number(localStorage.getItem(storageKeys.sessionCounter)) || 0;
  const isNewSession = !Number.isFinite(lastSessionAtSec) || (nowSec - lastSessionAtSec) >= sessionLengthSeconds;

  if (!isNewSession) {
    return currentSessionCounter;
  }
  const nextSessionCounter = currentSessionCounter + 1;
  localStorage.setItem(storageKeys.sessionCounter, String(nextSessionCounter));
  localStorage.setItem(storageKeys.lastSessionAtSec, String(nowSec));
  return nextSessionCounter;
};

const shouldHideForBackoff = ({ state, sessionCounter }) => {
  if (!state) {
    return false;
  }
  if (state.dismissedForever || state.maybeLaterCount >= MAX_MAYBE_LATER_CLICKS) {
    return true;
  }
  const nudgeRule = NUDGE_SCHEDULE[state.maybeLaterCount];
  if (!nudgeRule) {
    return false;
  }
  const sessionsSinceDismissal = sessionCounter - Number(state.sessionCountAtLastMaybeLater || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const lastMaybeLaterAtSec = Number(state.lastMaybeLaterAtSec || 0)
    || Math.floor(Number(state.lastMaybeLaterAtMs || 0) / 1000);
  const secondsSinceDismissal = nowSec - lastMaybeLaterAtSec;
  return !(sessionsSinceDismissal >= nudgeRule.sessions && secondsSinceDismissal >= (nudgeRule.days * 24 * 60 * 60));
};

const SiteWideBanner = ({
  mainText,
  secondaryText,
  actionButtons,
  learnMoreUrl,
  learnMoreText,
  cookieName,
  gtagParams,
  remoteConfig,
  useBackoffDismissal,
}) => {
  const [bannerVisibility, setBannerVisibility] = useState("");
  const storageKeys = getPromoStorageKeys(cookieName);
  const sessionLengthSeconds = getPromoSessionLengthSeconds(remoteConfig);
  const promoSessionCounter = useBackoffDismissal
    ? updatePromoSessionCounter({ storageKeys, sessionLengthSeconds })
    : null;

  useEffect(() => {
    const promoViewedSessionKey = `promo_viewed_${cookieName}`;
    if (!sessionStorage.getItem(promoViewedSessionKey)) {
      sessionStorage.setItem(promoViewedSessionKey, "1");
      gtag("event", "promo_viewed", gtagParams);
    }
  }, [cookieName, gtagParams]);

  const isDismissed = () => {
    if (useBackoffDismissal) {
      let backoffState = {};
      try {
        backoffState = JSON.parse(localStorage.getItem(storageKeys.state)) || {};
      } catch (e) {
        backoffState = {};
      }
      return shouldHideForBackoff({ state: backoffState, sessionCounter: promoSessionCounter });
    }
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
    if (useBackoffDismissal) {
      let previousState = {};
      try {
        previousState = JSON.parse(localStorage.getItem(storageKeys.state)) || {};
      } catch (e) {
        previousState = {};
      }
      const nextMaybeLaterCount = Math.min(
        Number(previousState.maybeLaterCount || 0) + 1,
        MAX_MAYBE_LATER_CLICKS,
      );
      const nextState = {
        maybeLaterCount: nextMaybeLaterCount,
        lastMaybeLaterAtSec: Math.floor(Date.now() / 1000),
        sessionCountAtLastMaybeLater: promoSessionCounter,
        dismissedForever: nextMaybeLaterCount >= MAX_MAYBE_LATER_CLICKS,
      };
      localStorage.setItem(storageKeys.state, JSON.stringify(nextState));
      trackBannerInteraction("maybe_later");
      return;
    }
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
          {useBackoffDismissal && (
            <button
              className="button small white siteWideBannerMaybeLater"
              onClick={closeBanner}
            >
              <span>{Sefaria._("Maybe later")}</span>
            </button>
          )}
        </div>
        {learnMoreUrl && (
          <a
            href={learnMoreUrl}
            className="bannerLearnMore"
            target="_blank"
            onClick={() => trackBannerInteraction("learn_more")}
          >
            {Sefaria._(learnMoreText) || Sefaria._("Learn More")}
          </a>
        )}
        {!useBackoffDismissal && (
          <button
            className="siteWideBannerClose"
            onClick={closeBanner}
            aria-label="Close banner"
          >
            &times;
          </button>
        )}
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
  remoteConfig: PropTypes.object,
  useBackoffDismissal: PropTypes.bool,
};

const CHATBOT_BANNER_MAIN_TEXT = Sefaria._("Try Sefaria's new Library Assistant [Experimental]");
const CHATBOT_BANNER_SECONDARY_TEXT = Sefaria._("Discover & explore texts in the Sefaria Library with our new AI-powered assistant.");
const CHATBOT_BANNER_LEARN_MORE_URLS = {
  en: "https://help.sefaria.org/hc/en-us/articles/26006423836828",
  he: "https://help.sefaria.org/hc/he/articles/26006423836828-%D7%9B%D7%99%D7%A6%D7%93-%D7%9C%D7%94%D7%A9%D7%AA%D7%9E%D7%A9-%D7%91%D7%A2%D7%95%D7%96%D7%A8-%D7%94%D7%A1%D7%A4%D7%A8%D7%99%D7%99%D7%94-%D7%A9%D7%9C-%D7%A1%D7%A4%D7%A8%D7%99%D7%90",
};
const CAMPAIGN_ID = "LA Stand Alone Promo";
const PROJECT = 'Library Assistant';

const ChatbotExperimentBanner = ({ promoLearnMoreUrls, remoteConfig }) => {
  const [isActionPending, setIsActionPending] = useState(false);
  const learnMoreUrls = promoLearnMoreUrls || CHATBOT_BANNER_LEARN_MORE_URLS;
  const learnMoreUrl = learnMoreUrls[Sefaria._getShortInterfaceLang()] || learnMoreUrls.en || CHATBOT_BANNER_LEARN_MORE_URLS.en;

  const handleJoin = async () => {
    setIsActionPending(true);
    try {
      await Sefaria.experimentsOptInAPI()
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
  if (!isLoggedIn && !Sefaria.isReturningVisitor()) {
    return null;
  }
  const nextParam = "?next=" + encodeURIComponent(Sefaria.util.currentPath());

  return (
    <SiteWideBanner
      mainText={CHATBOT_BANNER_MAIN_TEXT}
      secondaryText={CHATBOT_BANNER_SECONDARY_TEXT}
      actionButtons={(track) => isLoggedIn ? (
        <button className="button small" onClick={() => { track("join"); handleJoin(); }} disabled={isActionPending}>
          <span>{isActionPending ? Sefaria._("Joining...") : Sefaria._("Join the Experiment")}</span>
        </button>
      ) : (<>
        <a className="button small" href={"/login" + nextParam} onClick={() => track("login")}>
          <span>{Sefaria._("Log in to Join")}</span>
        </a>
        <a className="button small white" href={"/register" + nextParam} onClick={() => track("create_an_account")}>
          <span>{Sefaria._("Create an Account")}</span>
        </a>
      </>)}
      learnMoreUrl={learnMoreUrl}
      cookieName={isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"}
      gtagParams={{ campaignID: CAMPAIGN_ID, project: PROJECT }}
      remoteConfig={remoteConfig}
      useBackoffDismissal={true}
    />
  );
};

ChatbotExperimentBanner.propTypes = {
  promoLearnMoreUrls: PropTypes.object,
  remoteConfig: PropTypes.object,
};

export { SiteWideBanner, ChatbotExperimentBanner };
