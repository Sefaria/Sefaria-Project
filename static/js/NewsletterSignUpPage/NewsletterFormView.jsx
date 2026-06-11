import React from "react";
import classNames from "classnames";
import Sefaria from "../sefaria/sefaria";
import { InterfaceText, LoadingMessage } from "../Misc";
import SelectableOption from "./SelectableOption";
import MarketingEmailToggle from "./MarketingEmailToggle";
import { BILINGUAL_TEXT } from "./bilingualUtils";
import { FORM_STATUS } from "./stateSymbols";

/**
 * NewsletterFormView - Stage 1: Newsletter Selection Form
 *
 * Displays the initial form for:
 * - Logged-out users: First Name, Last Name, Email input fields
 * - Logged-in users: Email display and newsletter preference management
 *
 * Features:
 * - Inline validation error display
 * - Newsletter checkboxes with icons
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

function FormInput({ id, type = "text", label, value, onChange, onBlur, disabled, fieldErrors }) {
  const error = fieldErrors[id];
  return (
    <div className="formField">
      <input
        id={id}
        type={type}
        placeholder={Sefaria._(label)}
        value={value}
        onChange={(e) => onChange(id, e.target.value)}
        onBlur={() => onBlur && onBlur(id)}
        disabled={disabled}
        aria-label={Sefaria._(label)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={error ? "hasError" : ""}
        data-anl-event="form_interaction:inputStart"
        data-anl-form_name="newsletter_signup"
      />
    </div>
  );
}

function BackendErrorBanner({ message }) {
  return (
    <div
      className="newsletterErrorMessage"
      role="alert"
      data-anl-event="form_error:displayed"
      data-anl-engagement_type="error"
      data-anl-form_name="newsletter_signup"
    >
      <span className="errorIcon">⚠️</span>
      <span>
        <InterfaceText text={message} />
      </span>
    </div>
  );
}

function FieldErrorSummary({ fieldErrors }) {
  return (
    <div
      className="newsletterErrorSummary"
      role="alert"
      aria-live="assertive"
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
            <a href={`#${field}-error`} className="errorSummaryLink">
              <InterfaceText text={message} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmitButton({ isSubmitting, isLoggedIn }) {
  const buttonText = isLoggedIn ? BILINGUAL_TEXT.UPDATE_PREFERENCES : BILINGUAL_TEXT.SUBMIT;
  const loadingText = isLoggedIn ? BILINGUAL_TEXT.UPDATING : BILINGUAL_TEXT.SUBMITTING;
  return (
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
  );
}

export default function NewsletterFormView({
  formData,
  formStatus,
  newsletters,
  fieldErrors = {}, // Per-field validation errors
  hasAttemptedSubmit = false, // Whether user has tried to submit
  formTitleRef,
  onFieldChange, // Handler for any FormInput change: (field, value) => void
  onNewsletterToggle,
  onMarketingEmailToggle,
  onFieldBlur, // Handler for field blur validation
  onSubmit,
}) {
  const { isLoggedIn, userEmail } = formStatus;
  const isSubmitting = formStatus.status === FORM_STATUS.SUBMITTING;
  const hasFieldErrors = hasAttemptedSubmit && Object.keys(fieldErrors).length > 0;

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
        <h2 className="newsletterFormTitle" ref={formTitleRef}>
          <InterfaceText text={isLoggedIn ? BILINGUAL_TEXT.MANAGE_TITLE : BILINGUAL_TEXT.SUBSCRIBE_TITLE} />
        </h2>
        {!isLoggedIn && (
          <p className="newsletterFormSubtitle">
            <InterfaceText text={BILINGUAL_TEXT.SUBSCRIBE_SUBTITLE} />
          </p>
        )}
      </div>

      {/* EMAIL INFO + MARKETING TOGGLE SECTION (for logged-in users)
          Marketing toggle sits directly under the email display so the
          opt-in choice is the first decision the user makes. */}
      {isLoggedIn && (
        <>
          <div className="newsletterEmailInfo">
            <InterfaceText text={BILINGUAL_TEXT.MANAGING_SUBSCRIPTIONS_FOR} /> <strong>{userEmail}</strong>
          </div>
          <MarketingEmailToggle
            wantsMarketingEmails={formData.wantsMarketingEmails}
            onToggle={onMarketingEmailToggle}
            disabled={isSubmitting}
          />
        </>
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
          <BackendErrorBanner message={formStatus.errorMessage} />
        )}
        {/* ERROR SUMMARY - Announced via role="alert" for screen readers */}
        {hasFieldErrors && <FieldErrorSummary fieldErrors={fieldErrors} />}

        {/* NAME + CONTACT SECTIONS (hidden for logged-in users) */}
        {!isLoggedIn && (
          <>
            <div className="formSection">
              {/* Errors hoisted outside flex row so both inputs stay aligned */}
              <InlineError fieldName="firstName" errors={fieldErrors} />
              <InlineError fieldName="lastName" errors={fieldErrors} />
              <div className="nameFieldsRow">
                <FormInput
                  id="firstName"
                  label="First Name"
                  value={formData.firstName}
                  onChange={onFieldChange}
                  onBlur={onFieldBlur}
                  disabled={isSubmitting}
                  fieldErrors={fieldErrors}
                />
                <FormInput
                  id="lastName"
                  label="Last Name"
                  value={formData.lastName}
                  onChange={onFieldChange}
                  onBlur={onFieldBlur}
                  disabled={isSubmitting}
                  fieldErrors={fieldErrors}
                />
              </div>
            </div>

            <div className="formSection contactFormSection">
              <InlineError fieldName="email" errors={fieldErrors} />
              <FormInput
                id="email"
                type="email"
                label="Email Address"
                value={formData.email}
                onChange={onFieldChange}
                onBlur={onFieldBlur}
                disabled={isSubmitting}
                fieldErrors={fieldErrors}
              />
              <InlineError fieldName="confirmEmail" errors={fieldErrors} />
              <FormInput
                id="confirmEmail"
                type="email"
                label="Confirm Email Address"
                value={formData.confirmEmail}
                onChange={onFieldChange}
                onBlur={onFieldBlur}
                disabled={isSubmitting}
                fieldErrors={fieldErrors}
              />
            </div>
          </>
        )}

        {/* NEWSLETTER SELECTION SECTION */}
        <div className="formSection newsletterSelectionSection" id="newsletters">
          <p className="newsletterSelectionLabel">
            <InterfaceText text={BILINGUAL_TEXT.SELECT_LISTS_SECTION} />
          </p>

          {/* INLINE ERROR FOR NEWSLETTERS */}
          <InlineError fieldName="newsletters" errors={fieldErrors} />

          {/* CHECKBOXES */}
          <div
            className={classNames("newsletterCheckboxes", {
              disabled: isLoggedIn && !formData.wantsMarketingEmails,
              hasError: !!fieldErrors.newsletters,
            })}
            role="group"
            aria-label={Sefaria._("Newsletter options")}
            aria-invalid={!!fieldErrors.newsletters}
            aria-describedby={fieldErrors.newsletters ? "newsletters-error" : undefined}
          >
            {newsletters.map((newsletter) => (
              <SelectableOption
                key={newsletter.key}
                type="checkbox"
                label={<InterfaceText text={newsletter.displayName} />}
                icon={newsletter.icon}
                isSelected={formData.selectedNewsletters[newsletter.key] || false}
                onChange={() => onNewsletterToggle(newsletter.key)}
                disabled={isSubmitting || (isLoggedIn && !formData.wantsMarketingEmails)}
                analyticsAttributes={{
                  "data-anl-event": "newsletter_selected:input",
                  "data-anl-text": newsletter.key,
                  "data-anl-form_name": "newsletter_signup",
                }}
              />
            ))}
          </div>
        </div>

        <div className="formActions">
          <SubmitButton isSubmitting={isSubmitting} isLoggedIn={isLoggedIn} />
        </div>
      </form>

      {/* PRIVACY NOTE */}
      <div className="privacyNote">
        <p className="small"><InterfaceText text={BILINGUAL_TEXT.PRIVACY_NOTE_1} /></p>
        <p className="small"><InterfaceText text={BILINGUAL_TEXT.PRIVACY_NOTE_2} /></p>
      </div>
    </div>
  );
}
