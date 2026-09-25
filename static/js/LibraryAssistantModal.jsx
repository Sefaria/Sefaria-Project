import React, { useState } from "react";
import PropTypes from "prop-types";
import Sefaria from "./sefaria/sefaria";
import Modal from "./common/modal";
import {
  usePromoBackoffSession,
  usePromoViewedEvent,
  recordPromoMaybeLater,
  trackPromoClick,
} from "./SiteWideBanner";

// Same campaign identity the Library Assistant stand-alone promo banner reported,
// so analytics for the modal line up with the banner's history.
const CAMPAIGN_ID = "LA Stand Alone Promo";
const PROJECT = "Library Assistant";
const GTAG_PARAMS = { campaignID: CAMPAIGN_ID, project: PROJECT };

const getLibraryAssistantPromoCookieName = (isLoggedIn) => (
  isLoggedIn ? "chatbot_experiment_banner_dismissed" : "signup_promo_banner_dismissed"
);

// Route anon login/register through /enable-library-assistant so that, once they
// authenticate, the assistant is turned on and they're returned here — it then
// appears on reload with no extra "Join" click.
const getLibraryAssistantLoginHref = (currentPath) => {
  const enableDest = "/enable-library-assistant?next=" + encodeURIComponent(currentPath);
  return "/login?next=" + encodeURIComponent(enableDest);
};

/**
 * The Library Assistant promo (formerly the site-wide ChatbotExperimentBanner),
 * shown as a dialog when the user clicks "Assistant" in the header. Mounted only
 * while open, so promo_viewed / the session counter run when it opens.
 */
const LibraryAssistantModal = ({ onClose, promoSessionLengthSeconds }) => {
  const [isActionPending, setIsActionPending] = useState(false);
  const isLoggedIn = !!Sefaria._uid;
  const cookieName = getLibraryAssistantPromoCookieName(isLoggedIn);
  const { promoSessionCounter, storageKeys } = usePromoBackoffSession({
    cookieName, enableBackoffDismissal: true, promoSessionLengthSeconds,
  });
  usePromoViewedEvent(cookieName, GTAG_PARAMS);
  const track = (featureName) => trackPromoClick(GTAG_PARAMS, featureName);

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

  const handleMaybeLater = () => {
    recordPromoMaybeLater({ storageKeys, promoSessionCounter });
    track("maybe_later");
    onClose();
  };

  // ×, Escape and backdrop clicks: tracked, but no dismissal state is written.
  const handleClose = () => {
    track("close");
    onClose();
  };

  return (
    <Modal close={handleClose}>
      <div className="libraryAssistantModal">
        <button
          type="button"
          className="libraryAssistantModalClose"
          onClick={handleClose}
          aria-label={Sefaria._("common.close")}
        >
          &times;
        </button>
        <img className="libraryAssistantModalIcon" src="/static/icons/ai-double-star.svg" alt="" aria-hidden="true" />
        <h2 id="libraryAssistantModalTitle" className="libraryAssistantModalTitle">
          {Sefaria._("site_wide_banner.ask_the_library_assistant")}
        </h2>
        <p className="libraryAssistantModalText">
          {Sefaria._("site_wide_banner.discover_answers_to_your_questions")}
        </p>
        <div className="libraryAssistantModalButtons">
          {isLoggedIn ? (
            <button
              type="button"
              className="button libraryAssistantModalPrimary"
              onClick={() => { track("join"); handleJoin(); }}
              disabled={isActionPending}
            >
              <span>{isActionPending ? Sefaria._("common.loading") : Sefaria._("site_wide_banner.try_it")}</span>
            </button>
          ) : (
            <a
              className="button libraryAssistantModalPrimary logInToTry"
              href={getLibraryAssistantLoginHref(Sefaria.util.currentPath())}
              // Handled in-app (ReaderApp.handleInAppLinkClick), so close the dialog
              // or it would stay open over the login page.
              onClick={() => { track("login"); onClose(); }}
            >
              <span>{Sefaria._("site_wide_banner.log_in_to_try")}</span>
            </a>
          )}
          <button
            type="button"
            className="button libraryAssistantModalMaybeLater"
            onClick={handleMaybeLater}
          >
            <span>{Sefaria._("site_wide_banner.maybe_later")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

LibraryAssistantModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  promoSessionLengthSeconds: PropTypes.number,
};

export { LibraryAssistantModal, getLibraryAssistantLoginHref, getLibraryAssistantPromoCookieName };
