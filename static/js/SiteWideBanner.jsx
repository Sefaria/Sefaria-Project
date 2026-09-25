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

const readPromoBackoffState = (storageKeys) => {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.state)) || {};
  } catch (e) {
    return {};
  }
};

// Records one "Maybe later" click in the backoff state. Shared by every promo surface
// (banner, modal) so the nudge schedule sees the same history wherever it was dismissed.
const recordPromoMaybeLater = ({ storageKeys, promoSessionCounter }) => {
  const previousState = readPromoBackoffState(storageKeys);
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
};

const trackPromoClick = (gtagParams, feature_name) => {
  gtag("event", "promo_clicked", { ...gtagParams, feature_name });
};

// Client-only promo bookkeeping, run once on mount: migrates the legacy cookie and
// advances the promo session counter. Dismissal state lives in localStorage /
// document.cookie, which only exist in a browser, so nothing here runs during SSR;
// `isMounted` lets callers render nothing until the client has taken over.
const usePromoBackoffSession = ({ cookieName, enableBackoffDismissal, promoSessionLengthSeconds }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [promoSessionCounter, setPromoSessionCounter] = useState(null);
  const storageKeys = getPromoStorageKeys(cookieName);
  const sessionLengthSeconds = getPromoSessionLengthSeconds(promoSessionLengthSeconds);

  useEffect(() => {
    if (enableBackoffDismissal) {
      migrateLegacyCookieToBackoffState({ cookieName, storageKeys });
      setPromoSessionCounter(updatePromoSessionCounter({ storageKeys, sessionLengthSeconds }));
    }
    setIsMounted(true);
  }, []); // once, on mount: the storage reads above must never run during server rendering

  return { isMounted, promoSessionCounter, storageKeys };
};

// Fires promo_viewed at most once per browser session per promo (keyed on cookieName).
const usePromoViewedEvent = (cookieName, gtagParams) => {
  useEffect(() => {
    const promoViewedSessionKey = `promo_viewed_${cookieName}`;
    if (!sessionStorage.getItem(promoViewedSessionKey)) {
      sessionStorage.setItem(promoViewedSessionKey, "1");
      gtag("event", "promo_viewed", gtagParams);
    }
  }, [cookieName, gtagParams]);
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
  // The first client render matches the server HTML (no banner); the real
  // decision is made once usePromoBackoffSession has mounted.
  const { isMounted, promoSessionCounter, storageKeys } = usePromoBackoffSession({
    cookieName, enableBackoffDismissal, promoSessionLengthSeconds,
  });
  const effectiveNudgeSchedule = nudgeSchedule || NUDGE_SCHEDULE;
  usePromoViewedEvent(cookieName, gtagParams);

  const isDismissed = () => {
    if (enableBackoffDismissal) {
      return shouldHideForBackoff({ state: readPromoBackoffState(storageKeys), sessionCounter: promoSessionCounter, nudgeSchedule: effectiveNudgeSchedule });
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

  const trackBannerInteraction = (feature_name) => trackPromoClick(gtagParams, feature_name);

  const closeBanner = () => {
    setBannerVisibility("hidden");
    if (enableBackoffDismissal) {
      recordPromoMaybeLater({ storageKeys, promoSessionCounter });
      trackBannerInteraction("maybe_later");
      return;
    }
    dismiss();
    trackBannerInteraction("close");
  };

  if (!isMounted) {
    return null;
  }
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

const CHATBOT_BANNER_EXCLUDED_PATHS = ["/login", "/register", "/password/reset/confirm"];

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

export {
  SiteWideBanner,
  isChatbotBannerExcludedPath,
  usePromoBackoffSession,
  usePromoViewedEvent,
  recordPromoMaybeLater,
  trackPromoClick,
};
