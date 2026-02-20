import React from 'react';
import { InterfaceText, LoadingMessage } from '../Misc';
import SelectableOption from './SelectableOption';
import { BILINGUAL_TEXT } from './bilingualUtils';

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
}) {
  // Check if user selected the general "Sefaria News & Resources" newsletter
  // (This is the list that triggers confirmation email + welcome series)
  // The first newsletter in the dynamic list is always the general one (AC list ID 1)
  const generalKey = newsletters.length > 0 ? newsletters[0].key : null;
  const hasGeneralNewsletter = generalKey && selectedNewsletters[generalKey] === true;
  const isSubmitting = formStatus.status === 'submitting';

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
          <InterfaceText text={BILINGUAL_TEXT.THANK_YOU} />
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
        {formStatus.status === 'error' && formStatus.errorMessage && (
          <div className="learningLevelErrorMessage"
               data-anl-event="form_error:displayed"
               data-anl-engagement_type="error"
               data-anl-form_name="learning_level_survey">
            <span className="errorIcon">⚠️</span>
            <span>{formStatus.errorMessage}</span>
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

            {/* SKIP OPTION */}
            <p className="skipPrompt">
              <span className="int-en">
                Or <a href="#"
                       className="skipLink"
                       onClick={(e) => {
                         e.preventDefault();
                         onSkip();
                       }}
                       data-anl-event="learning_level_action:click"
                       data-anl-action="skip_learning_level"
                       data-anl-form_name="learning_level_survey">
                  skip this step
                </a> and go straight to the homepage
              </span>
              <span className="int-he">
                או <a href="#"
                      className="skipLink"
                      onClick={(e) => {
                        e.preventDefault();
                        onSkip();
                      }}
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
