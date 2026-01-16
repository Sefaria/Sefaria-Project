import React from 'react';
import { renderBilingual, BILINGUAL_TEXT } from './bilingualUtils';

/**
 * NewsletterConfirmationView - Stage 2a: Subscription Confirmation
 *
 * Displays confirmation message after successful newsletter subscription.
 * Conditionally shows confirmation email message based on whether user
 * subscribed to the general "Sefaria News & Resources" list.
 *
 * Features:
 * - Clear single goal: acknowledge subscription success
 * - Progressive disclosure: only shows what's needed at this step
 * - Conditional messaging based on newsletter selection
 * - Full bilingual support (English/Hebrew)
 * - Analytics tracking for confirmation view
 */
export default function NewsletterConfirmationView({
  email,
  selectedNewsletters,
  selectedNewsletterLabels,
  onContinue,
}) {
  // Check if user selected the general "Sefaria News & Resources" newsletter
  // (This is the list that triggers confirmation email + welcome series)
  const hasGeneralNewsletter = selectedNewsletters.sefaria_news === true;

  return (
    <div className="newsletterConfirmationView"
         data-anl-batch={JSON.stringify({
           form_name: 'newsletter_confirmation',
           engagement_type: 'success',
         })}>

      {/* SUCCESS ICON AND HEADING */}
      <div className="confirmationContent">
        <div className="successIcon">
          <img
            src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
            alt=""
            aria-hidden="true"
          />
        </div>

        <h2 className="confirmationTitle">
          {renderBilingual(BILINGUAL_TEXT.THANK_YOU)}
        </h2>

        {/* CONDITIONAL MESSAGE */}
        {hasGeneralNewsletter ? (
          <p className="confirmationMessage">
            <span className="int-en">
              {BILINGUAL_TEXT.CONFIRMATION_SENT.en} <strong>{email}</strong>.<br />
              {BILINGUAL_TEXT.SHOULD_SEE_SOON.en}
            </span>
            <span className="int-he">
              {BILINGUAL_TEXT.CONFIRMATION_SENT.he} <strong>{email}</strong>.<br />
              {BILINGUAL_TEXT.SHOULD_SEE_SOON.he}
            </span>
          </p>
        ) : (
          <p className="confirmationMessage">
            <span className="int-en">
              {BILINGUAL_TEXT.SUBMISSION_RECEIVED.en}<br />
              {BILINGUAL_TEXT.PREFERENCES_SAVED.en}
            </span>
            <span className="int-he">
              {BILINGUAL_TEXT.SUBMISSION_RECEIVED.he}<br />
              {BILINGUAL_TEXT.PREFERENCES_SAVED.he}
            </span>
          </p>
        )}

        {/* SELECTED NEWSLETTERS DISPLAY */}
        {selectedNewsletterLabels && (
          <div className="selectedNewslettersDisplay"
               data-anl-text={selectedNewsletterLabels}>
            <p className="selectedLabel">
              <span className="int-en">You've subscribed to:</span>
              <span className="int-he">הרשמת לרשימה:</span>
            </p>
            <p className="selectedList">{selectedNewsletterLabels}</p>
          </div>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div className="confirmationActions">
        <button
          className="continueButton primary"
          onClick={onContinue}
          data-anl-event="confirmation_action:click"
          data-anl-action="continue_to_learning_level"
          data-anl-form_name="newsletter_confirmation">
          <span className="int-en">Tell us about your learning level</span>
          <span className="int-he">ספר לנו על רמת הלמידה שלך</span>
        </button>
      </div>

      {/* SKIP OPTION */}
      <p className="skipPrompt">
        <span className="int-en">
          Or <a href="#"
                 className="skipLink"
                 onClick={(e) => {
                   e.preventDefault();
                   onContinue();
                 }}
                 data-anl-event="confirmation_action:click"
                 data-anl-action="skip_learning_level"
                 data-anl-form_name="newsletter_confirmation">
            skip this step
          </a> and go straight to the homepage
        </span>
        <span className="int-he">
          או <a href="#"
                className="skipLink"
                onClick={(e) => {
                  e.preventDefault();
                  onContinue();
                }}
                data-anl-event="confirmation_action:click"
                data-anl-action="skip_learning_level"
                data-anl-form_name="newsletter_confirmation">
            דלג על שלב זה
          </a> ועבור ישירות לדף הבית
        </span>
      </p>
    </div>
  );
}
