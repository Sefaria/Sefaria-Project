import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import $ from "./sefaria/sefariaJquery";
import Sefaria from "./sefaria/sefaria";

const DEFAULT_PROMO_SESSION_LENGTH_SECONDS = 30 * 60;
const MAX_MAYBE_LATER_CLICKS = 3;
const SECONDS_PER_DAY = 24 * 60 * 60;
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

const getPromoSessionLengthSeconds = (promoSessionLengthSeconds) => {
  const configuredSessionLengthSeconds = Number(promoSessionLengthSeconds);
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
  localStorage.setItem(storageKeys.sessionCounter, nextSessionCounter);
  localStorage.setItem(storageKeys.lastSessionAtSec, nowSec);
  return nextSessionCounter;
};

const migrateLegacyCookieToBackoffState = ({ cookieName, storageKeys }) => {
  // One-time migration from the old close-button system to the new backoff system.
  // If backoff state already exists we've migrated (or the user is native to the new
  // system), so there's nothing to do.
  if (localStorage.getItem(storageKeys.state)) {
    return;
  }
  // A legacy dismissal is recorded only as `${cookieName}=1` with no timestamp, so we
  // can't recover when it was set. But any existing legacy cookie necessarily predates
  // this deploy, so we treat it as a single "Maybe later" from long ago: backdate the
  // time gate (lastDismissalTime: 0) so only the session gate remains before re-showing.
  if (!document.cookie.includes(cookieName)) {
    return;
  }
  const migratedState = {
    maybeLaterCount: 1,
    lastDismissalTime: 0,
    sessionCountAtLastDismissal: 0,
    dismissedForever: false,
  };
  localStorage.setItem(storageKeys.state, JSON.stringify(migratedState));
};

const shouldHideForBackoff = ({ state, sessionCounter, nudgeSchedule = NUDGE_SCHEDULE }) => {
  // No dismissal history yet — show the banner.
  if (!state) {
    return false;
  }

  // User opted out for good (explicitly, or by hitting the click cap) — hide permanently.
  if (state.dismissedForever || state.maybeLaterCount >= MAX_MAYBE_LATER_CLICKS) {
    return true;
  }

  // No nudge rule for this dismissal count means there's nothing left to wait on — show it.
  const nudgeRule = nudgeSchedule[state.maybeLaterCount];
  if (!nudgeRule) {
    return false;
  }

  // Otherwise, re-show only once BOTH gates since the last "Maybe later" have cleared.
  const sessionsSinceDismissal = sessionCounter - Number(state.sessionCountAtLastDismissal || 0);
  const secondsSinceDismissal = Math.floor(Date.now() / 1000) - Number(state.lastDismissalTime || 0);

  const enoughSessionsHavePassed = sessionsSinceDismissal >= nudgeRule.sessions;
  const enoughTimeHasPassed = secondsSinceDismissal >= nudgeRule.days * SECONDS_PER_DAY;
  const isReadyToReShow = enoughSessionsHavePassed && enoughTimeHasPassed;

  return !isReadyToReShow;
};

const SiteWideBanner = ({
  mainText,
  secondaryText,
  actionButtons,
  learnMoreUrl,
  learnMoreText,
  cookieName,
  gtagParams,
  enableBackoffDismissal,
  nudgeSchedule,
  promoSessionLengthSeconds,
}) => {
  const [bannerVisibility, setBannerVisibility] = useState("");
  const storageKeys = getPromoStorageKeys(cookieName);
  const effectiveNudgeSchedule = nudgeSchedule || NUDGE_SCHEDULE;
  const sessionLengthSeconds = getPromoSessionLengthSeconds(promoSessionLengthSeconds);
  if (enableBackoffDismissal) {
    migrateLegacyCookieToBackoffState({ cookieName, storageKeys });
  }
  const promoSessionCounter = enableBackoffDismissal
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
    if (enableBackoffDismissal) {
      let backoffState = {};
      try {
        backoffState = JSON.parse(localStorage.getItem(storageKeys.state)) || {};
      } catch (e) {
        backoffState = {};
      }
      return shouldHideForBackoff({ state: backoffState, sessionCounter: promoSessionCounter, nudgeSchedule: effectiveNudgeSchedule });
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
    if (enableBackoffDismissal) {
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
        lastDismissalTime: Math.floor(Date.now() / 1000),
        sessionCountAtLastDismissal: promoSessionCounter,
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
          {enableBackoffDismissal && (
            <button
              type="button"
              className="button small siteWideBannerMaybeLater"
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
        {!enableBackoffDismissal && (
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
  enableBackoffDismissal: PropTypes.bool,
  nudgeSchedule: PropTypes.object,
  promoSessionLengthSeconds: PropTypes.number,
};

const CHATBOT_BANNER_MAIN_TEXT = Sefaria._("Enhance Your Learning Experience");
const CHATBOT_BANNER_SECONDARY_TEXT_HE = <div>נסו את <a href="https://help.sefaria.org/hc/he/articles/26006423836828-How-to-Use-the-Sefaria-Library-Assistant">עוזר הספרייה</a> שלנו, המופעל על ידי בינה מלאכותית, על מנת להעמיק את הבנתכם ולגלות מקורות חדשים.</div>;
const CHATBOT_BANNER_SECONDARY_TEXT = <div>Try our AI-powered <a href="https://help.sefaria.org/hc/en-us/articles/26006423836828-How-to-Use-the-Sefaria-Library-Assistant">Library Assistant</a> to deepen your understanding and discover new texts.</div>;
const CAMPAIGN_ID = "LA Stand Alone Promo";
const PROJECT = 'Library Assistant';

const ChatbotExperimentBanner = ({ promoLearnMoreUrls, promoMaybeLaterJSON, promoSessionLengthSeconds }) => {
  const [isActionPending, setIsActionPending] = useState(false);
  // Learn-more URL is now embedded in the banner copy; no separate learn-more link needed.

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
      secondaryText={Sefaria._v({en: CHATBOT_BANNER_SECONDARY_TEXT, he: CHATBOT_BANNER_SECONDARY_TEXT_HE})}
      actionButtons={(track) => isLoggedIn ? (
        <button type="button" className="button small" onClick={() => { track("join"); handleJoin(); }} disabled={isActionPending}>
          <span>{isActionPending ? Sefaria._("Loading...") : Sefaria._("Try It")}</span>
        </button>
      ) : (<>
        <a className="button small logInToTry" href={"/login" + nextParam} onClick={() => track("login")}>
          <span>{Sefaria._("Log in to Try")}</span>
        </a>
      </>)}
      cookieName={isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"}
      gtagParams={{ campaignID: CAMPAIGN_ID, project: PROJECT }}
      enableBackoffDismissal={true}
      nudgeSchedule={promoMaybeLaterJSON || NUDGE_SCHEDULE}
      promoSessionLengthSeconds={promoSessionLengthSeconds}
    />
  );
};

ChatbotExperimentBanner.propTypes = {
  promoLearnMoreUrls: PropTypes.object,
  promoMaybeLaterJSON: PropTypes.object,
  promoSessionLengthSeconds: PropTypes.number,
};

export { SiteWideBanner, ChatbotExperimentBanner };
