import React from 'react';
import Sefaria from '../sefaria/sefaria';
import NewsletterCheckbox from './NewsletterCheckbox';
import { renderBilingual, BILINGUAL_TEXT } from './bilingualUtils';

/**
 * NewsletterFormView - Stage 1: Newsletter Selection Form
 *
 * Displays the initial form for:
 * - Logged-out users: First Name, Last Name (optional), Email input fields
 * - Logged-in users: Email display and newsletter preference management
 *
 * Features:
 * - Inline validation error display
 * - Newsletter checkboxes with emoji
 * - "We recommend" copy section
 * - Full bilingual support (English/Hebrew) with minimal JSX duplication
 * - Responsive layout
 */
export default function NewsletterFormView({
  formData,
  formStatus,
  newsletters,
  isLoggedIn,
  userEmail,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onConfirmEmailChange,
  onNewsletterToggle,
  onSubmit,
}) {
  const isSubmitting = formStatus.status === 'submitting';
  const hasError = formStatus.status === 'error';
  const buttonText = isLoggedIn ? BILINGUAL_TEXT.UPDATE_PREFERENCES : BILINGUAL_TEXT.SUBMIT;
  const loadingText = isLoggedIn ? BILINGUAL_TEXT.UPDATING : BILINGUAL_TEXT.SUBMITTING;

  return (
    <div className="newsletterFormView"
         data-anl-batch={JSON.stringify({
           form_name: 'newsletter_signup',
           form_destination: isLoggedIn ? 'manage_preferences' : 'new_subscription',
         })}>

      {/* HEADER SECTION */}
      <div className="newsletterFormHeader">
        <h2 className="newsletterFormTitle">
          {renderBilingual(
            isLoggedIn
              ? BILINGUAL_TEXT.MANAGE_TITLE
              : BILINGUAL_TEXT.SUBSCRIBE_TITLE
          )}
        </h2>
        <p className="newsletterFormSubtitle">
          {renderBilingual(
            isLoggedIn
              ? BILINGUAL_TEXT.MANAGE_SUBTITLE
              : BILINGUAL_TEXT.SUBSCRIBE_SUBTITLE
          )}
        </p>
      </div>

      {/* EMAIL INFO SECTION (for logged-in users) */}
      {isLoggedIn && (
        <div className="newsletterEmailInfo">
          <span className="int-en">Manage subscriptions for <strong>{userEmail}</strong></span>
          <span className="int-he">נהל מינויים עבור <strong>{userEmail}</strong></span>
        </div>
      )}

      {/* FORM FIELDS SECTION */}
      <form className="newsletterForm" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        {/* ERROR MESSAGE */}
        {hasError && formStatus.errorMessage && (
          <div className="newsletterErrorMessage"
               data-anl-event="form_error:displayed"
               data-anl-engagement_type="error">
            <span className="errorIcon">⚠️</span>
            <span>{formStatus.errorMessage}</span>
          </div>
        )}

        {/* NAME SECTION (hidden for logged-in users) */}
        {!isLoggedIn && (
          <div className="formSection nameSection">
            <h3 className="sectionHeader">
              {renderBilingual(BILINGUAL_TEXT.NAME_SECTION)}
            </h3>
            <div className="nameFieldsRow">
              <div className="formField firstNameField">
                <input
                  id="firstName"
                  type="text"
                  placeholder={Sefaria._('First Name')}
                  value={formData.firstName}
                  onChange={(e) => onFirstNameChange(e.target.value)}
                  disabled={isSubmitting}
                  aria-label={Sefaria._('First Name')}
                  data-anl-event="form_interaction:inputStart"
                  data-anl-form_name="newsletter_signup"
                />
              </div>
              <div className="formField lastNameField">
                <input
                  id="lastName"
                  type="text"
                  placeholder={Sefaria._('Last Name')}
                  value={formData.lastName}
                  onChange={(e) => onLastNameChange(e.target.value)}
                  disabled={isSubmitting}
                  aria-label={Sefaria._('Last Name')}
                  data-anl-event="form_interaction:inputStart"
                  data-anl-form_name="newsletter_signup"
                />
              </div>
            </div>
          </div>
        )}

        {/* CONTACT SECTION (hidden for logged-in users) */}
        {!isLoggedIn && (
          <div className="formSection contactSection">
            <h3 className="sectionHeader">
              {renderBilingual(BILINGUAL_TEXT.CONTACT_SECTION)}
            </h3>
            <div className="formField emailField">
              <input
                id="email"
                type="email"
                placeholder={Sefaria._('Email Address')}
                value={formData.email}
                onChange={(e) => onEmailChange(e.target.value)}
                disabled={isSubmitting}
                aria-label={Sefaria._('Email Address')}
                data-anl-event="form_interaction:inputStart"
                data-anl-form_name="newsletter_signup"
              />
            </div>
            <div className="formField confirmEmailField">
              <input
                id="confirmEmail"
                type="email"
                placeholder={Sefaria._('Confirm Email Address')}
                value={formData.confirmEmail}
                onChange={(e) => onConfirmEmailChange(e.target.value)}
                disabled={isSubmitting}
                aria-label={Sefaria._('Confirm Email Address')}
                data-anl-event="form_interaction:inputStart"
                data-anl-form_name="newsletter_signup"
              />
            </div>
          </div>
        )}

        {/* NEWSLETTER SELECTION SECTION */}
        <div className="formSection newsletterSelectionSection">
          <h3 className="sectionHeader">
            {renderBilingual(BILINGUAL_TEXT.SELECT_LISTS_SECTION)}
          </h3>

          {/* CHECKBOXES */}
          <div className="newsletterCheckboxes">
            {newsletters.map((newsletter) => (
              <NewsletterCheckbox
                key={newsletter.key}
                newsletter={newsletter}
                isChecked={formData.selectedNewsletters[newsletter.key] || false}
                onChange={() => onNewsletterToggle(newsletter.key)}
                disabled={isSubmitting}
              />
            ))}
          </div>
        </div>

        {/* FINISHED SECTION */}
        <div className="formSection finishedSection">
          <h3 className="sectionHeader">
            {renderBilingual(BILINGUAL_TEXT.FINISHED_SECTION)}
          </h3>
          <div className="formActions">
            <button
              type="submit"
              className="submitButton primary"
              disabled={isSubmitting}
              data-anl-event="newsletter_action:click"
              data-anl-action={isLoggedIn ? 'update_preferences' : 'submit'}
              data-anl-form_name="newsletter_signup">
              {isSubmitting ? renderBilingual(loadingText) : renderBilingual(buttonText)}
            </button>
          </div>
        </div>
      </form>

      {/* PRIVACY NOTE */}
      <div className="privacyNote">
        <p className="small">
          {renderBilingual(BILINGUAL_TEXT.PRIVACY_NOTE)}
        </p>
      </div>
    </div>
  );
}
