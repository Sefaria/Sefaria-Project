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
  imgSrc,
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

  return (!isDismissed() && <div className={`siteWideBanner ${bannerVisibility}`}>
    <div className="siteWideBannerContent">
      {imgSrc && <img className="siteWideBannerIcon" src={imgSrc} alt="" aria-hidden="true" />}
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
            <span>{Sefaria._("site_wide_banner.maybe_later")}</span>
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
          {Sefaria._(learnMoreText) || Sefaria._("common.learn_more")}
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
  </div>);
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
  imgSrc: PropTypes.string,
};

const CAMPAIGN_ID = "LA Stand Alone Promo";
const PROJECT = 'Library Assistant';
const CHATBOT_BANNER_EXCLUDED_PATHS = ["/login", "/register", "/password/reset"];

// Keep authentication and password-recovery screens focused on the task at hand.
const isChatbotBannerExcludedPath = (path, moduleUrl) => {
  let pathname;
  try {
    // moduleUrl can be false (getModuleURL falls back to apiHost, which is empty
    // during server-side rendering); only the pathname matters here, so any valid
    // base keeps URL parsing from throwing mid-render.
    pathname = new URL(path, moduleUrl || "https://www.sefaria.org").pathname;
  } catch (e) {
    return false;
  }
  return CHATBOT_BANNER_EXCLUDED_PATHS.some(
    excludedPath => pathname === excludedPath || pathname.startsWith(`${excludedPath}/`)
  );
};

const LibraryAssistantPromoBanner = ({ promoMaybeLaterJSON, promoSessionLengthSeconds }) => {
  const [isActionPending, setIsActionPending] = useState(false);

  const handleJoin = async () => {
    setIsActionPending(true);
    try {
      await Sefaria.editProfileAPI({settings: {library_assistant: true}})
        .then(() => {
          window.location.reload();
          return new Promise(() => {}); // never resolves
        });
    } finally {
      setIsActionPending(false);
    }
  };

  if (isChatbotBannerExcludedPath(Sefaria.util.currentPath(), Sefaria.getModuleURL())) {
    return null;
  }
  const isLoggedIn = !!Sefaria._uid;
  // Route anon login/register through /enable-library-assistant so that, once they
  // authenticate, the assistant is turned on and they're returned here — it then
  // appears on reload with no extra "Join" click.
  const enableDest = "/enable-library-assistant?next=" + encodeURIComponent(Sefaria.util.currentPath());
  const nextParam = "?next=" + encodeURIComponent(enableDest);

  return (
    <SiteWideBanner
      mainText={Sefaria._("site_wide_banner.ask_the_library_assistant")}
      secondaryText={Sefaria._("site_wide_banner.discover_answers_to_your_questions")}
      imgSrc="/static/icons/ai-double-star.svg"
      actionButtons={(track) => isLoggedIn ? (
        <button type="button" className="button small white" onClick={() => { track("join"); handleJoin(); }} disabled={isActionPending}>
          <span>{isActionPending ? Sefaria._("common.loading") : Sefaria._("site_wide_banner.try_it")}</span>
        </button>
      ) : (<>
        <a className="button small white logInToTry" href={"/login" + nextParam} onClick={() => track("login")}>
          <span>{Sefaria._("site_wide_banner.log_in_to_try")}</span>
        </a>
      </>)}
      // The storage key keeps its original name on purpose: renaming it would reset
      // every logged-in user's dismissal history and start nagging them again.
      cookieName={isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"}
      gtagParams={{ campaignID: CAMPAIGN_ID, project: PROJECT }}
      enableBackoffDismissal={true}
      nudgeSchedule={promoMaybeLaterJSON || NUDGE_SCHEDULE}
      promoSessionLengthSeconds={promoSessionLengthSeconds}
    />
  );
};

LibraryAssistantPromoBanner.propTypes = {
  promoMaybeLaterJSON: PropTypes.object,
  promoSessionLengthSeconds: PropTypes.number,
};

export { SiteWideBanner, LibraryAssistantPromoBanner, isChatbotBannerExcludedPath };
