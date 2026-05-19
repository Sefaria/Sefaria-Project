import React from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText } from "../Misc";
import { BILINGUAL_TEXT } from "./bilingualUtils";
import { FORM_STATUS } from "./stateSymbols";
import LearningLevelSurvey from "./LearningLevelSurvey";

/**
 * Resolves a newsletter key (e.g., "general") to its bilingual display label.
 * Falls back to the key itself if no matching newsletter is found.
 */
function keyToDisplayLabel(newsletters, key) {
  const nl = newsletters.find((n) => n.key === key);
  if (!nl) return key;
  const { en, he } = nl.displayName;
  return Sefaria.interfaceLang === "hebrew" ? he || en : en || he;
}

/**
 * Predicate: will the user actually receive a confirmation email after this submit?
 *
 * ActiveCampaign only sends confirmation emails for NEW subscriptions to the general
 * newsletter (always the first item in the dynamic list, AC list ID 1).
 *
 * Logic (where G = generalNewsletter exists, L = isLoggedIn, D = subscriptionDiffs exists,
 *              A = newsletter in added list, S = newsletter selected):
 *   willReceive = G ∧ ((L ∧ D → A) ∨ (¬(L ∧ D) → S))
 *
 * For logged-in users with a known diff: "new" means the general newsletter is in `added`.
 * For logged-out users (or logged-in without a diff): "new" means it's currently selected
 *   — since logged-out flows imply fresh signups.
 */
function computeWillReceiveConfirmationEmail({ isLoggedIn, subscriptionDiffs, selectedNewsletters, newsletters }) {
  const general = newsletters.length > 0 ? newsletters[0] : null;
  if (!general) return false;
  return isLoggedIn && subscriptionDiffs
    ? subscriptionDiffs.added.includes(general.key)
    : !!selectedNewsletters[general.key];
}

/**
 * SubscriptionChangesSummary — display block for logged-in users with diffs.
 * Renders any combination of added / removed / opted-out / no-change states.
 */
function SubscriptionChangesSummary({ diffs, marketingOptOut, newsletters }) {
  const { added, removed } = diffs;
  const nothingChanged = added.length === 0 && removed.length === 0 && !marketingOptOut;
  return (
    <div className="selectedNewslettersDisplay">
      {!marketingOptOut && (
        <>
          {added.length > 0 && (
            <div data-anl-text={added.join(", ")}>
              <p className="selectedLabel">
                <InterfaceText text={BILINGUAL_TEXT.SUBSCRIBED_TO} />
              </p>
              <p className="selectedList">{added.map((k) => keyToDisplayLabel(newsletters, k)).join(", ")}</p>
            </div>
          )}
          {removed.length > 0 && (
            <div data-anl-text={removed.join(", ")}>
              <p className="selectedLabel">
                <InterfaceText text={BILINGUAL_TEXT.UNSUBSCRIBED_FROM} />
              </p>
              <p className="selectedList">{removed.map((k) => keyToDisplayLabel(newsletters, k)).join(", ")}</p>
            </div>
          )}
        </>
      )}
      {marketingOptOut && (
        <p className="selectedLabel singleCase">
          <InterfaceText text={BILINGUAL_TEXT.OPTED_OUT_MARKETING} />
        </p>
      )}
      {nothingChanged && (
        <p className="selectedLabel singleCase">
          <InterfaceText text={BILINGUAL_TEXT.PREFERENCES_UP_TO_DATE} />
        </p>
      )}
    </div>
  );
}

/**
 * NewsletterConfirmationView - Stage 2: Subscription Confirmation with Learning Level
 *
 * Displays confirmation messaging after a successful newsletter submission, plus
 * an embedded optional learning-level survey (delegated to LearningLevelSurvey).
 *
 * Features:
 * - Conditional confirmation messaging based on whether the user signed up for the
 *   general newsletter (only those subscriptions trigger an ActiveCampaign confirmation email)
 * - Diff display for logged-in users (added / removed / opted-out / no-change)
 * - Embedded optional learning-level survey
 * - Full bilingual support (English/Hebrew)
 * - Analytics tracking for confirmation view
 */
export default function NewsletterConfirmationView({
  email,
  selectedNewsletters,
  newsletters = [],
  formStatus,
  selectedLevel,
  learningLevels,
  onLevelSelect,
  onSave,
  onSkip,
  isLoggedIn = false,
  subscriptionDiffs = null,
  marketingOptOut = false,
}) {
  const isSubmitting = formStatus.status === FORM_STATUS.SUBMITTING;
  const errorMessage = formStatus.status === FORM_STATUS.ERROR ? formStatus.errorMessage : null;

  const willReceiveConfirmationEmail = computeWillReceiveConfirmationEmail({
    isLoggedIn,
    subscriptionDiffs,
    selectedNewsletters,
    newsletters,
  });

  // Logged-out display: derive selected keys + labels for the simple list rendering.
  const selectedKeys = Object.entries(selectedNewsletters)
    .filter(([, isSelected]) => isSelected)
    .map(([key]) => key);
  const selectedNewsletterKeys = selectedKeys.join(", ");
  const selectedNewsletterLabels = selectedKeys.map((k) => keyToDisplayLabel(newsletters, k)).join(", ");

  return (
    <div
      className="newsletterConfirmationView"
      data-anl-batch={JSON.stringify({
        form_name: "newsletter_confirmation",
        engagement_type: "success",
      })}
    >
      {/* SUCCESS ICON AND HEADING - Only show when NOT opting out of marketing */}
      <div className="confirmationContent">
        {!marketingOptOut && (
          <>
            <div className="successIcon">
              <img
                src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
                alt="Success"
                aria-hidden="true"
              />
            </div>

            <h2 className="confirmationTitle">
              <InterfaceText text={BILINGUAL_TEXT.THANK_YOU} />
            </h2>

            {/* CONDITIONAL MESSAGE
                - Show "check email for confirmation" only when user will actually receive a confirmation email
                - Show generic "preferences saved" message otherwise
            */}
            {willReceiveConfirmationEmail ? (
              <p className="confirmationMessage">
                <InterfaceText text={BILINGUAL_TEXT.CONFIRMATION_SENT} /> <strong>{email}</strong>.<br />
                <InterfaceText text={BILINGUAL_TEXT.SHOULD_SEE_SOON} />
              </p>
            ) : (
              <p className="confirmationMessage">
                <InterfaceText text={BILINGUAL_TEXT.SUBMISSION_RECEIVED} />
                <br />
                <InterfaceText text={BILINGUAL_TEXT.PREFERENCES_SAVED} />
              </p>
            )}
          </>
        )}

        {/* SELECTED NEWSLETTERS DISPLAY */}
        {isLoggedIn && subscriptionDiffs ? (
          <SubscriptionChangesSummary
            diffs={subscriptionDiffs}
            marketingOptOut={marketingOptOut}
            newsletters={newsletters}
          />
        ) : (
          selectedNewsletterKeys && (
            <div className="selectedNewslettersDisplay" data-anl-text={selectedNewsletterKeys}>
              <p className="selectedLabel">
                <InterfaceText text={BILINGUAL_TEXT.SUBSCRIBED_TO} />
              </p>
              <p className="selectedList">{selectedNewsletterLabels}</p>
            </div>
          )
        )}
      </div>

      {/* EMBEDDED LEARNING LEVEL SECTION */}
      <LearningLevelSurvey
        learningLevels={learningLevels}
        selectedLevel={selectedLevel}
        onLevelSelect={onLevelSelect}
        onSave={onSave}
        onSkip={onSkip}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />
    </div>
  );
}
