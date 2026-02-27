import React from "react";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText, LoadingMessage } from "../Misc";
import SelectableOption from "./SelectableOption";
import MarketingEmailToggle from "./MarketingEmailToggle";
import { BILINGUAL_TEXT } from "./bilingualUtils";
import { FORM_STATUS } from "./constants";

/**
 * NewsletterFormView - Stage 1: Newsletter Selection Form
 *
 * Displays the initial form for:
 * - Logged-out users: First Name, Last Name (optional), Email input fields
 * - Logged-in users: Email display and newsletter preference management
 *
 * Features:
 * - Inline validation error display
 * - Newsletter checkboxes with icons
 * - "We recommend" copy section
 * - Full bilingual support (English/Hebrew) with minimal JSX duplication
 * - Responsive layout
 */
/**
 * InlineError - Displays field-specific error above an input
 * Only renders if the field has an error
 */
function InlineError({ fieldName, errors }) {
  const error = errors[fieldName];
  if (!error) return null;

  return (
    <div className="inlineFieldError" id={`${fieldName}-error`} role="alert">
      <InterfaceText text={error} />
    </div>
  );
}

export default function NewsletterFormView({
  formData,
  formStatus,
  newsletters,
  isLoggedIn,
  userEmail,
  fieldErrors = {}, // Per-field validation errors
  hasAttemptedSubmit = false, // Whether user has tried to submit
  errorSummaryRef, // Ref for focusing error summary
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
  onConfirmEmailChange,
  onNewsletterToggle,
  onMarketingEmailToggle,
  onFieldBlur, // Handler for field blur validation
  onSubmit,
}) {
  const isSubmitting = formStatus.status === FORM_STATUS.SUBMITTING;
  const hasFieldErrors = hasAttemptedSubmit && Object.keys(fieldErrors).length > 0;
  const buttonText = isLoggedIn ? BILINGUAL_TEXT.UPDATE_PREFERENCES : BILINGUAL_TEXT.SUBMIT;
  const loadingText = isLoggedIn ? BILINGUAL_TEXT.UPDATING : BILINGUAL_TEXT.SUBMITTING;

  return (
    <div
      className="newsletterFormView"
      data-anl-batch={JSON.stringify({
        form_name: "newsletter_signup",
        form_destination: isLoggedIn ? "manage_preferences" : "new_subscription",
      })}
    >
      {/* HEADER SECTION */}
      <div className="newsletterFormHeader">
        <h2 className="newsletterFormTitle">
          <InterfaceText text={isLoggedIn ? BILINGUAL_TEXT.MANAGE_TITLE : BILINGUAL_TEXT.SUBSCRIBE_TITLE} />
        </h2>
        <p className="newsletterFormSubtitle">
          <InterfaceText text={isLoggedIn ? BILINGUAL_TEXT.MANAGE_SUBTITLE : BILINGUAL_TEXT.SUBSCRIBE_SUBTITLE} />
        </p>
      </div>

      {/* EMAIL INFO SECTION (for logged-in users) */}
      {isLoggedIn && (
        <div className="newsletterEmailInfo">
          <InterfaceText text={BILINGUAL_TEXT.MANAGING_SUBSCRIPTIONS_FOR} /> <strong>{userEmail}</strong>
        </div>
      )}

      {/* FORM FIELDS SECTION */}
      <form
        className="newsletterForm"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        {/* BACKEND ERROR — shown when API call fails after successful client-side validation */}
        {formStatus.status === FORM_STATUS.ERROR && formStatus.errorMessage && (
          <div
            className="newsletterErrorMessage"
            role="alert"
            data-anl-event="form_error:displayed"
            data-anl-engagement_type="error"
            data-anl-form_name="newsletter_signup"
          >
            <span className="errorIcon">⚠️</span>
            <span>
              <InterfaceText text={formStatus.errorMessage} />
            </span>
          </div>
        )}
        {/* ERROR SUMMARY - Focus target for accessibility */}
        {hasFieldErrors && (
          <div
            ref={errorSummaryRef}
            className="newsletterErrorSummary"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            data-anl-event="form_error:displayed"
            data-anl-engagement_type="error"
          >
            <h3 className="errorSummaryTitle">
              <span className="errorIcon">⚠️</span>
              <InterfaceText text={BILINGUAL_TEXT.FIX_ERRORS} />
            </h3>
            <ul className="errorSummaryList">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <a href={`#${field}`} className="errorSummaryLink">
                    <InterfaceText text={message} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* NAME SECTION (hidden for logged-in users) */}
        {!isLoggedIn && (
          <div className="formSection nameSection">
            <h3 className="sectionHeader">
              <InterfaceText text={BILINGUAL_TEXT.NAME_SECTION} />
            </h3>
            {/* Error placed outside flex row so both inputs stay aligned */}
            <InlineError fieldName="firstName" errors={fieldErrors} />
            <div className="nameFieldsRow">
              <div className="formField firstNameField">
                <input
                  id="firstName"
                  type="text"
                  placeholder={Sefaria._("First Name")}
                  value={formData.firstName}
                  onChange={(e) => onFirstNameChange(e.target.value)}
                  onBlur={() => onFieldBlur && onFieldBlur("firstName")}
                  disabled={isSubmitting}
                  aria-label={Sefaria._("First Name")}
                  aria-invalid={!!fieldErrors.firstName}
                  aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
                  className={fieldErrors.firstName ? "hasError" : ""}
                  data-anl-event="form_interaction:inputStart"
                  data-anl-form_name="newsletter_signup"
                />
              </div>
              <div className="formField lastNameField">
                <input
                  id="lastName"
                  type="text"
                  placeholder={Sefaria._("Last Name (Optional)")}
                  value={formData.lastName}
                  onChange={(e) => onLastNameChange(e.target.value)}
                  disabled={isSubmitting}
                  aria-label={Sefaria._("Last Name (Optional)")}
                  aria-required="false"
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
              <InterfaceText text={BILINGUAL_TEXT.CONTACT_SECTION} />
            </h3>
            <div className="formField emailField">
              <InlineError fieldName="email" errors={fieldErrors} />
              <input
                id="email"
                type="email"
                placeholder={Sefaria._("Email Address")}
                value={formData.email}
                onChange={(e) => onEmailChange(e.target.value)}
                onBlur={() => onFieldBlur && onFieldBlur("email")}
                disabled={isSubmitting}
                aria-label={Sefaria._("Email Address")}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className={fieldErrors.email ? "hasError" : ""}
                data-anl-event="form_interaction:inputStart"
                data-anl-form_name="newsletter_signup"
              />
            </div>
            <div className="formField confirmEmailField">
              <InlineError fieldName="confirmEmail" errors={fieldErrors} />
              <input
                id="confirmEmail"
                type="email"
                placeholder={Sefaria._("Confirm Email Address")}
                value={formData.confirmEmail}
                onChange={(e) => onConfirmEmailChange(e.target.value)}
                onBlur={() => onFieldBlur && onFieldBlur("confirmEmail")}
                disabled={isSubmitting}
                aria-label={Sefaria._("Confirm Email Address")}
                aria-invalid={!!fieldErrors.confirmEmail}
                aria-describedby={fieldErrors.confirmEmail ? "confirmEmail-error" : undefined}
                className={fieldErrors.confirmEmail ? "hasError" : ""}
                data-anl-event="form_interaction:inputStart"
                data-anl-form_name="newsletter_signup"
              />
            </div>
          </div>
        )}

        {/* NEWSLETTER SELECTION SECTION */}
        <div className="formSection newsletterSelectionSection" id="newsletters">
          <h3 className="sectionHeader">
            <InterfaceText text={BILINGUAL_TEXT.SELECT_LISTS_SECTION} />
          </h3>

          {/* INLINE ERROR FOR NEWSLETTERS */}
          <InlineError fieldName="newsletters" errors={fieldErrors} />

          {/* CHECKBOXES */}
          <div
            className={`newsletterCheckboxes${isLoggedIn && !formData.wantsMarketingEmails ? " disabled" : ""}${fieldErrors.newsletters ? " hasError" : ""}`}
            role="group"
            aria-label={Sefaria._("Newsletter options")}
            aria-invalid={!!fieldErrors.newsletters}
            aria-describedby={fieldErrors.newsletters ? "newsletters-error" : undefined}
          >
            {newsletters.map((newsletter) => (
              <SelectableOption
                key={newsletter.key}
                type="checkbox"
                label={Sefaria._(newsletter.labelKey)}
                icon={newsletter.icon}
                isSelected={formData.selectedNewsletters[newsletter.key] || false}
                onChange={() => onNewsletterToggle(newsletter.key)}
                disabled={isSubmitting || (isLoggedIn && !formData.wantsMarketingEmails)}
                analyticsAttributes={{
                  "data-anl-event": "newsletter_selected:input",
                  "data-anl-text": Sefaria._(newsletter.labelKey),
                  "data-anl-form_name": "newsletter_signup",
                }}
              />
            ))}
          </div>

          {/* MARKETING EMAIL TOGGLE (logged-in users only) */}
          {isLoggedIn && (
            <MarketingEmailToggle
              wantsMarketingEmails={formData.wantsMarketingEmails}
              onToggle={onMarketingEmailToggle}
              disabled={isSubmitting}
            />
          )}
        </div>

        {/* FINISHED SECTION */}
        <div className="formSection finishedSection">
          <h3 className="sectionHeader">
            <InterfaceText text={BILINGUAL_TEXT.FINISHED_SECTION} />
          </h3>
          <div className="formActions">
            <button
              type="submit"
              className="submitButton primary"
              disabled={isSubmitting}
              data-anl-event="newsletter_action:click"
              data-anl-action={isLoggedIn ? "update_preferences" : "submit"}
              data-anl-form_name="newsletter_signup"
            >
              {isSubmitting ? (
                <LoadingMessage message={loadingText.en} heMessage={loadingText.he} />
              ) : (
                <InterfaceText text={buttonText} />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* PRIVACY NOTE */}
      <div className="privacyNote">
        <p className="small">
          <InterfaceText text={BILINGUAL_TEXT.PRIVACY_NOTE} />
        </p>
      </div>
    </div>
  );
}
