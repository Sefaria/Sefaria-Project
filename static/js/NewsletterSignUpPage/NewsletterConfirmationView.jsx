import React from 'react';
import { InterfaceText, LoadingMessage } from '../Misc';
import SelectableOption from './SelectableOption';
import { BILINGUAL_TEXT } from './bilingualUtils';
import { FORM_STATUS } from './constants';

/**
 * NewsletterConfirmationView - Stage 2: Subscription Confirmation with Learning Level
 *
 * Displays confirmation message after successful newsletter subscription,
 * along with an embedded optional learning level form.
 *
 * Features:
 * - Clear single goal: acknowledge subscription success
 * - Embedded learning level survey (no separate stage)
 * - Conditional messaging based on newsletter selection
 * - Full bilingual support (English/Hebrew)
 * - Analytics tracking for confirmation view
 */
export default function NewsletterConfirmationView({
  email,
  selectedNewsletters,
  selectedNewsletterLabels,
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
  /**
   * Determine if we should show "check your email for confirmation" messaging.
   *
   * ActiveCampaign only sends confirmation emails for NEW subscriptions.
   *
   * Logic (where G = generalNewsletter exists, L = isLoggedIn, D = subscriptionDiffs exists,
   *              A = newsletter in added list, S = newsletter selected):
   *   willReceive = G ∧ ((L ∧ D → A) ∨ (¬(L ∧ D) → S))
   *
   * For logged-in users with diffs: check if general newsletter was ADDED
   * For logged-out users (or logged-in without diffs): check if general newsletter is SELECTED
   *   (For logged-out users, "selected" implies "new" since they're signing up)
   *
   * The first newsletter in the dynamic list is always the general one (AC list ID 1).
   */
  const generalNewsletter = newsletters.length > 0 ? newsletters[0] : null;

  const willReceiveConfirmationEmail = generalNewsletter && (
    (isLoggedIn && subscriptionDiffs)
      ? subscriptionDiffs.added.includes(Sefaria._(generalNewsletter.labelKey))
      : selectedNewsletters[generalNewsletter.key]
  );

  const isSubmitting = formStatus.status === FORM_STATUS.SUBMITTING;

  return (
    <div className="newsletterConfirmationView"
         data-anl-batch={JSON.stringify({
           form_name: 'newsletter_confirmation',
           engagement_type: 'success',
         })}>

      {/* SUCCESS ICON AND HEADING - Only show when NOT opting out of marketing */}
      <div className="confirmationContent">
        {!marketingOptOut && (
          <>
            <div className="successIcon">
              <img
                src="/static/icons/newsletter-signup/newsletter-selected-checkbox.svg"
                alt=""
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
          </>
        )}

        {/* SELECTED NEWSLETTERS DISPLAY */}
        {isLoggedIn && subscriptionDiffs ? (
          <div className="selectedNewslettersDisplay">
            {subscriptionDiffs.added.length > 0 && (
              <div data-anl-text={subscriptionDiffs.added.join(', ')}>
                <p className="selectedLabel">
                  <span className="int-en">{BILINGUAL_TEXT.SUBSCRIBED_TO.en}</span>
                  <span className="int-he">{BILINGUAL_TEXT.SUBSCRIBED_TO.he}</span>
                </p>
                <p className="selectedList">{subscriptionDiffs.added.join(', ')}</p>
              </div>
            )}
            {subscriptionDiffs.removed.length > 0 && (
              <div data-anl-text={subscriptionDiffs.removed.join(', ')}>
                <p className="selectedLabel">
                  <span className="int-en">{BILINGUAL_TEXT.UNSUBSCRIBED_FROM.en}</span>
                  <span className="int-he">{BILINGUAL_TEXT.UNSUBSCRIBED_FROM.he}</span>
                </p>
                <p className="selectedList">{subscriptionDiffs.removed.join(', ')}</p>
              </div>
            )}
            {marketingOptOut && (
              <p className="selectedLabel">
                <span className="int-en">{BILINGUAL_TEXT.OPTED_OUT_MARKETING.en}</span>
                <span className="int-he">{BILINGUAL_TEXT.OPTED_OUT_MARKETING.he}</span>
              </p>
            )}
            {subscriptionDiffs.added.length === 0 && subscriptionDiffs.removed.length === 0 && !marketingOptOut && (
              <p className="selectedLabel">
                <span className="int-en">{BILINGUAL_TEXT.PREFERENCES_UP_TO_DATE.en}</span>
                <span className="int-he">{BILINGUAL_TEXT.PREFERENCES_UP_TO_DATE.he}</span>
              </p>
            )}
          </div>
        ) : (
          selectedNewsletterLabels && (
            <div className="selectedNewslettersDisplay"
                 data-anl-text={selectedNewsletterLabels}>
              <p className="selectedLabel">
                <span className="int-en">{BILINGUAL_TEXT.SUBSCRIBED_TO.en}</span>
                <span className="int-he">{BILINGUAL_TEXT.SUBSCRIBED_TO.he}</span>
              </p>
              <p className="selectedList">{selectedNewsletterLabels}</p>
            </div>
          )
        )}
      </div>

      {/* EMBEDDED LEARNING LEVEL SECTION */}
      <div className="embeddedLearningLevel"
           data-anl-batch={JSON.stringify({
             form_name: 'learning_level_survey',
             engagement_type: 'optional_profile_data',
           })}>

        {/* HEADER WITH OPTIONAL INDICATOR */}
        <div className="learningLevelHeaderWrapper">
          <h3 className="learningLevelHeader">
            <InterfaceText text={BILINGUAL_TEXT.LEARNING_LEVEL_HEADER} />
          </h3>
          <span className="optionalLabel">
            <InterfaceText text={BILINGUAL_TEXT.OPTIONAL} />
          </span>
        </div>

        {/* ERROR MESSAGE (if any) */}
        {formStatus.status === FORM_STATUS.ERROR && formStatus.errorMessage && (
          <div className="learningLevelErrorMessage"
               data-anl-event="form_error:displayed"
               data-anl-engagement_type="error"
               data-anl-form_name="learning_level_survey">
            <span className="errorIcon">⚠️</span>
            <span><InterfaceText text={formStatus.errorMessage} /></span>
          </div>
        )}

        {/* RADIO OPTIONS */}
        <form className="learningLevelForm" onSubmit={(e) => { e.preventDefault(); onSave(true); }}>
          <div className="learningLevelOptions">
            {learningLevels.map((level) => (
              <SelectableOption
                key={level.value}
                type="radio"
                name="learningLevel"
                value={level.value}
                label={<InterfaceText text={level.description} />}
                isSelected={selectedLevel === level.value}
                onChange={() => onLevelSelect(level.value)}
                disabled={isSubmitting}
                analyticsAttributes={{
                  'data-anl-event': 'learning_level_selected:input',
                  'data-anl-text': level.label.en,
                  'data-anl-form_name': 'learning_level_survey',
                }}
              />
            ))}
          </div>

          {/* ACTION BUTTONS */}
          <div className="learningLevelActions">
            <button
              type="submit"
              className="saveButton primary"
              disabled={isSubmitting || selectedLevel === null}
              data-anl-event="learning_level_action:click"
              data-anl-action="save_learning_level"
              data-anl-form_name="learning_level_survey">
              {isSubmitting ? <LoadingMessage message={BILINGUAL_TEXT.SUBMITTING.en} heMessage={BILINGUAL_TEXT.SUBMITTING.he} /> : <InterfaceText text={BILINGUAL_TEXT.SUBMIT} />}
            </button>

            {/* SKIP OPTION - Disabled during submission to prevent concurrent actions */}
            <p className="skipPrompt">
              <span className="int-en">
                Or <a href="#"
                       className={`skipLink${isSubmitting ? ' disabled' : ''}`}
                       onClick={(e) => {
                         e.preventDefault();
                         if (!isSubmitting) {
                           onSkip();
                         }
                       }}
                       aria-disabled={isSubmitting}
                       data-anl-event="learning_level_action:click"
                       data-anl-action="skip_learning_level"
                       data-anl-form_name="learning_level_survey">
                  skip this step
                </a> and go straight to the homepage
              </span>
              <span className="int-he">
                או <a href="#"
                      className={`skipLink${isSubmitting ? ' disabled' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        if (!isSubmitting) {
                          onSkip();
                        }
                      }}
                      aria-disabled={isSubmitting}
                      data-anl-event="learning_level_action:click"
                      data-anl-action="skip_learning_level"
                      data-anl-form_name="learning_level_survey">
                  דלג על שלב זה
                </a> ועבור ישירות לדף הבית
              </span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
