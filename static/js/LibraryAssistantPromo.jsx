import React, { useState } from "react";
import Sefaria from "./sefaria/sefaria";
import {
  usePromoBackoffSession,
  usePromoViewedEvent,
  isPromoHiddenForBackoff,
  recordPromoMaybeLater,
  trackPromoClick,
} from "./SiteWideBanner";
import {
  LIBRARY_ASSISTANT_GTAG_PARAMS as GTAG_PARAMS,
  getLibraryAssistantLoginHref,
  getLibraryAssistantPromoCookieName,
  useLibraryAssistantJoin,
} from "./LibraryAssistantModal";

// Text-link CTAs that run an action rather than navigate. preventDefault also tells
// ReaderApp.handleInAppLinkClick to leave the click alone.
const actionLink = (handler) => (e) => {
  e.preventDefault();
  handler();
};

const LibraryAssistantPromoWidget = () => {
  const [isDismissed, setIsDismissed] = useState(false);
  const { isActionPending, handleJoin } = useLibraryAssistantJoin();
  const isLoggedIn = !!Sefaria._uid;
  const cookieName = getLibraryAssistantPromoCookieName(isLoggedIn);
  // Renders nothing until mounted: the backoff state is browser-only (see the hook).
  const { isMounted, promoSessionCounter, storageKeys } = usePromoBackoffSession({
    cookieName,
    enableBackoffDismissal: true,
    promoSessionLengthSeconds: Sefaria.chatbot_promo_session_length_seconds,
  });
  // The assistant only runs on desktop, so like the old banner there's nothing to try on mobile.
  const isVisible = isMounted && !isDismissed
    && Sefaria.getBreakpoint() !== Sefaria.breakpoints.MOBILE
    && !isPromoHiddenForBackoff({
      storageKeys, promoSessionCounter, nudgeSchedule: Sefaria.chatbot_promo_maybe_later_json,
    });
  usePromoViewedEvent(cookieName, GTAG_PARAMS, isVisible);
  const track = (featureName) => trackPromoClick(GTAG_PARAMS, featureName);

  if (!isVisible) {
    return null;
  }

  const handleTryIt = () => {
    if (isActionPending) { return; }
    track("join");
    handleJoin();
  };
  const handleMaybeLater = () => {
    recordPromoMaybeLater({ storageKeys, promoSessionCounter });
    track("maybe_later");
    setIsDismissed(true);
  };

  return (
    <div className="navSidebarModule sans-serif libraryAssistantPromo">
      <h1>
        <img className="libraryAssistantPromoIcon" src="/static/icons/ai-double-star.svg" alt="" aria-hidden="true" />
        {Sefaria._("site_wide_banner.ask_the_library_assistant")}
      </h1>
      <p className="libraryAssistantPromoText">
        {Sefaria._("site_wide_banner.discover_answers_to_your_questions")}
      </p>
      <div className="libraryAssistantPromoLinks">
        {isLoggedIn ? (
          <a href="#" className="tryIt" onClick={actionLink(handleTryIt)} aria-disabled={isActionPending || undefined}>
            {isActionPending ? Sefaria._("common.loading") : Sefaria._("site_wide_banner.try_it")}
          </a>
        ) : (
          <a className="logInToTry" href={getLibraryAssistantLoginHref(Sefaria.util.currentPath())} onClick={() => track("login")}>
            {Sefaria._("site_wide_banner.log_in_to_try")}
          </a>
        )}
        <a href="#" className="maybeLater" onClick={actionLink(handleMaybeLater)}>
          {Sefaria._("site_wide_banner.maybe_later")}
        </a>
      </div>
    </div>
  );
};

/**
 * Library Assistant promo for the library homepage sidebar: the old site-wide banner's
 * icon, copy, events and "Maybe later" backoff, as a compact module with text links.
 * Hidden for users who have already opted in or out of the assistant.
 */
const LibraryAssistantPromo = () => (
  Sefaria.in_chatbot_experiment ? null : <LibraryAssistantPromoWidget />
);

export { LibraryAssistantPromo };
