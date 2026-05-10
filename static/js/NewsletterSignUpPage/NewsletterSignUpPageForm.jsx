import React, { useState, useEffect, useRef } from "react";
import Sefaria from "../sefaria/sefaria";
import { FORM_STATUS, STAGE, NEWSLETTERS, LEARNING_LEVELS } from "./constants";
import { BILINGUAL_TEXT } from "./bilingualUtils";
import { LoadingMessage, LoadingRing } from "../Misc";
import NewsletterFormView from "./NewsletterFormView";
import NewsletterConfirmationView from "./NewsletterConfirmationView";
import SuccessView from "./SuccessView";
import {
  subscribeNewsletter,
  updatePreferences,
  updateLearningLevel,
  fetchUserSubscriptions,
  getNewsletterLists,
} from "./newsletterApi";

/**
 * NewsletterSignUpPageForm - Main container component
 *
 * Manages the entire form flow with state machine pattern:
 * - Detects user authentication status (logged-in vs. logged-out)
 * - Manages form data state (user inputs)
 * - Manages form status state (current stage, submission status, errors)
 * - Routes between different views based on current stage
 * - Handles API calls with mocked endpoints
 */
function buildFieldValidators(formData, formStatus) {
  return {
    firstName: () =>
      !formStatus.isLoggedIn && !formData.firstName.trim()
        ? BILINGUAL_TEXT.ENTER_FIRST_NAME
        : null,
    lastName: () =>
      !formStatus.isLoggedIn && !formData.lastName.trim()
        ? BILINGUAL_TEXT.ENTER_LAST_NAME
        : null,
    email: () => {
      if (!formData.email.trim()) return BILINGUAL_TEXT.ENTER_EMAIL;
      if (!Sefaria.util.isValidEmailAddress(formData.email))
        return BILINGUAL_TEXT.VALID_EMAIL;
      return null;
    },
    confirmEmail: () =>
      !formStatus.isLoggedIn && formData.email !== formData.confirmEmail
        ? BILINGUAL_TEXT.EMAILS_MISMATCH
        : null,
    newsletters: () => {
      if (formStatus.isLoggedIn) return null;
      return Object.values(formData.selectedNewsletters).some((v) => v)
        ? null
        : BILINGUAL_TEXT.SELECT_NEWSLETTER;
    },
  };
}

export default function NewsletterSignUpPageForm({ onStageChange }) {
  // ========== FORM DATA STATE ==========
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    confirmEmail: "",
    selectedNewsletters: {},
    learningLevel: null,
    wantsMarketingEmails: true, // Default to opted-in for marketing emails
  });

  // ========== FORM STATUS STATE (STATE MACHINE) ==========
  const [formStatus, setFormStatus] = useState({
    currentStage: STAGE.NEWSLETTER_SELECTION,
    status: FORM_STATUS.IDLE,
    errorMessage: null,
    successMessage: null,
    isLoggedIn: false,
    userEmail: null,
  });

  // ========== VALIDATION STATE ==========
  // Tracks per-field validation errors and whether user has attempted submit
  const [validationState, setValidationState] = useState({
    fieldErrors: {}, // { firstName: 'error', email: 'error', ... }
    hasAttemptedSubmit: false, // Only show errors after first submit attempt
  });

  // ========== DYNAMIC NEWSLETTER LIST ==========
  const [newsletters, setNewsletters] = useState(NEWSLETTERS);
  const [newslettersLoading, setNewslettersLoading] = useState(true);

  // Ref for focusing error summary on validation failure (accessibility)
  const errorSummaryRef = useRef(null);
  // Ref for scrolling to top of form section on stage transition
  const containerRef = useRef(null);

  // Baseline snapshots for computing subscription diffs (logged-in users only).
  // Refs because these are write-once values that never drive rendering.
  const initialSubscriptionsRef = useRef({});
  const initialWantsMarketingRef = useRef(true);

  // ========== INITIALIZATION: Detect authentication status ==========
  useEffect(() => {
    const isLoggedIn = !!Sefaria._uid;
    const userEmail = isLoggedIn ? Sefaria._email : null;

    setFormStatus((prev) => ({ ...prev, isLoggedIn, userEmail }));
    if (isLoggedIn) {
      setFormData((prev) => ({ ...prev, email: userEmail }));
    }

    // Build promises array; both fetches run in parallel.
    // Each promise catches internally so Promise.all never rejects — the
    // loader always clears even when one API call fails.
    const promises = [
      getNewsletterLists()
        .then((response) => {
          if (response.newsletters) {
            setNewsletters(
              response.newsletters.map((nl) => ({
                key: nl.stringid,
                displayName: nl.displayName,
                icon: nl.icon,
              })),
            );
          }
        })
        .catch((error) => {
          console.error(
            "Failed to fetch newsletter lists, using defaults:",
            error,
          );
        }),
    ];

    if (isLoggedIn) {
      promises.push(
        fetchUserSubscriptions(userEmail)
          .then((response) => {
            if (response.success && response.subscribedNewsletters) {
              const selectedNewsletters = {};
              response.subscribedNewsletters.forEach((key) => {
                selectedNewsletters[key] = true;
              });

              // Stale opt-out detection: if backend says opted-out but user has
              // active managed subscriptions (re-subscribed via another channel),
              // show as opted-in. The MongoDB value is NOT corrected until user submits.
              const backendWantsMarketing =
                response.wantsMarketingEmails ?? true;
              const hasActiveManagedSubscription =
                response.subscribedNewsletters.length > 0;
              const effectiveWantsMarketing =
                !backendWantsMarketing && hasActiveManagedSubscription
                  ? true
                  : backendWantsMarketing;

              initialSubscriptionsRef.current = { ...selectedNewsletters };
              initialWantsMarketingRef.current = effectiveWantsMarketing;

              setFormData((prev) => ({
                ...prev,
                selectedNewsletters,
                wantsMarketingEmails: effectiveWantsMarketing,
                learningLevel: response.learningLevel ?? null,
              }));
            }
          })
          .catch((error) => {
            console.error("Failed to fetch user subscriptions:", error);
          }),
      );
    }

    // Gate: form only renders after ALL required data arrives
    Promise.all(promises).finally(() => setNewslettersLoading(false));
  }, []);

  // Revalidate newsletter selection reactively after submit has been attempted.
  // This runs after render, so formData.selectedNewsletters is always fresh —
  // unlike the old setTimeout approach which suffered from stale closures.
  useEffect(() => {
    if (!validationState.hasAttemptedSubmit) return;
    setValidationState((prev) => {
      const hasSelection = Object.values(formData.selectedNewsletters).some(
        (v) => v,
      );
      const newErrors = { ...prev.fieldErrors };
      if (!formStatus.isLoggedIn && !hasSelection) {
        newErrors.newsletters = BILINGUAL_TEXT.SELECT_NEWSLETTER;
      } else {
        delete newErrors.newsletters;
      }
      const hadError = !!prev.fieldErrors.newsletters;
      const hasError = !!newErrors.newsletters;
      if (hadError === hasError) return prev;
      return { ...prev, fieldErrors: newErrors };
    });
  }, [
    formData.selectedNewsletters,
    validationState.hasAttemptedSubmit,
    formStatus.isLoggedIn,
  ]);

  useEffect(() => {
    onStageChange?.(formStatus.currentStage);
  }, [formStatus.currentStage, onStageChange]);

  // Scroll to top of form section when transitioning to confirmation or success
  useEffect(() => {
    if (formStatus.currentStage !== STAGE.NEWSLETTER_SELECTION) {
      containerRef.current?.scrollIntoView?.({
        behavior: "instant",
        block: "start",
      });
    }
  }, [formStatus.currentStage]);

  // ========== HANDLERS: Form data updates ==========
  // Note: Errors are cleared on blur, not on change, for better UX

  const makeFieldSetter = (field) => (value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleFirstNameChange = makeFieldSetter("firstName");
  const handleLastNameChange = makeFieldSetter("lastName");
  const handleEmailChange = makeFieldSetter("email");
  const handleConfirmEmailChange = makeFieldSetter("confirmEmail");
  const handleMarketingEmailToggle = makeFieldSetter("wantsMarketingEmails");
  const handleLearningLevelSelect = makeFieldSetter("learningLevel");

  const handleNewsletterToggle = (key) => {
    setFormData((prev) => ({
      ...prev,
      selectedNewsletters: {
        ...prev.selectedNewsletters,
        [key]: !prev.selectedNewsletters[key],
      },
    }));
  };

  // ========== HANDLERS: Field blur validation ==========

  /**
   * Validates a specific field on blur and updates validation state.
   * Only runs if user has already attempted to submit (to avoid premature errors).
   * @param {string} fieldName - The name of the field that lost focus
   */
  const handleFieldBlur = (fieldName) => {
    // Only validate if user has already attempted submit
    if (!validationState.hasAttemptedSubmit) return;

    const fieldValidators = buildFieldValidators(formData, formStatus);

    const validator = fieldValidators[fieldName];
    if (validator) {
      const error = validator();
      setValidationState((prev) => {
        const newErrors = { ...prev.fieldErrors };
        if (error) {
          newErrors[fieldName] = error;
        } else {
          delete newErrors[fieldName];
        }
        // Re-evaluate confirmEmail when email changes, but only if confirmEmail has been
        // touched (has a value) or already has an error that may need clearing.
        if (
          fieldName === "email" &&
          (formData.confirmEmail !== "" || newErrors.confirmEmail)
        ) {
          const confirmError = fieldValidators.confirmEmail();
          if (confirmError) {
            newErrors.confirmEmail = confirmError;
          } else {
            delete newErrors.confirmEmail;
          }
        }
        return { ...prev, fieldErrors: newErrors };
      });
    }
  };

  // ========== HANDLERS: Form submission ==========

  const handleSubscribeSubmit = async () => {
    // Validate all fields and get errors object
    const errors = validateFormData();
    const hasErrors = Object.keys(errors).length > 0;

    // Update validation state with all errors and mark that submit was attempted
    setValidationState({
      fieldErrors: errors,
      hasAttemptedSubmit: true,
    });

    if (hasErrors) {
      // Set form status to error (for any legacy UI handling)
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: null, // Clear old single-error message, we use fieldErrors now
      }));

      // Scroll form title into view; error summary announces itself via role="alert"
      setTimeout(() => {
        errorSummaryRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      return;
    }

    // For logged-in users: skip API call if nothing actually changed
    if (formStatus.isLoggedIn) {
      const diffs = getSubscriptionDiffs();
      const optOutChanged =
        formData.wantsMarketingEmails !== initialWantsMarketingRef.current;

      if (
        diffs.added.length === 0 &&
        diffs.removed.length === 0 &&
        !optOutChanged
      ) {
        setFormStatus((prev) => ({
          ...prev,
          currentStage: STAGE.CONFIRMATION,
        }));
        return;
      }
    }

    // Clear any previous error state and prepare for submission
    setFormStatus((prev) => ({
      ...prev,
      status: FORM_STATUS.SUBMITTING,
      errorMessage: null,
    }));

    // Always send actual selections; backend handles opt-out via marketingOptOut flag
    const newslettersToSubmit = formData.selectedNewsletters;

    try {
      if (formStatus.isLoggedIn) {
        // For logged-in users: update preferences
        // Pass marketingOptOut flag to indicate intent when newsletters is empty
        await updatePreferences(formStatus.userEmail, newslettersToSubmit, {
          marketingOptOut: !formData.wantsMarketingEmails,
        });
      } else {
        // For logged-out users: subscribe
        await subscribeNewsletter({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          newsletters: formData.selectedNewsletters,
        });
      }

      // Success! Move to confirmation view
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.SUCCESS,
        currentStage: STAGE.CONFIRMATION,
        successMessage: `We've sent a confirmation to ${formData.email}. You should see it soon.`,
      }));
    } catch (error) {
      // Error during submission
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: error.message
          ? { en: error.message, he: error.message }
          : BILINGUAL_TEXT.GENERIC_ERROR,
      }));
    }
  };

  const handleLearningLevelSubmit = async (shouldSave) => {
    if (!shouldSave) {
      // User clicked "No thanks" - go straight to the home page
      window.location.href = "/";
      return;
    }

    if (formData.learningLevel === null) {
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: BILINGUAL_TEXT.SELECT_LEARNING_LEVEL,
      }));
      return;
    }

    setFormStatus((prev) => ({ ...prev, status: FORM_STATUS.SUBMITTING }));

    try {
      await updateLearningLevel(formData.email, formData.learningLevel);

      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.SUCCESS,
        currentStage: STAGE.SUCCESS,
      }));
    } catch (error) {
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: error.message
          ? { en: error.message, he: error.message }
          : BILINGUAL_TEXT.GENERIC_ERROR,
      }));
    }
  };

  // ========== VALIDATION ==========

  /**
   * Validates all form fields and returns an object of errors.
   * Returns empty object if all fields are valid.
   * @returns {Object} - { fieldName: errorMessage } for each invalid field
   */
  const validateFormData = () => {
    const validators = buildFieldValidators(formData, formStatus);
    return Object.fromEntries(
      Object.entries(validators)
        .map(([field, validate]) => [field, validate()])
        .filter(([, error]) => error !== null),
    );
  };

  // ========== HELPERS: Subscription diff computation ==========

  /**
   * Computes the set differences between initial and current newsletter selections.
   * Returns human-readable labels for added and removed newsletters.
   */
  const getSubscriptionDiffs = () => {
    const initial = initialSubscriptionsRef.current;
    const current = formData.selectedNewsletters;

    const added = Object.keys(current).filter(
      (key) => current[key] && !initial[key],
    );
    const removed = Object.keys(initial).filter(
      (key) => initial[key] && !current[key],
    );

    return { added, removed };
  };

  // ========== RENDER: View routing based on current stage ==========

  return (
    <div className="newsletterSignUpPageForm" ref={containerRef}>
      {formStatus.currentStage === STAGE.NEWSLETTER_SELECTION &&
        newslettersLoading && (
          <div className="newsletterLoadingState">
            <LoadingRing />
            <LoadingMessage />
          </div>
        )}

      {formStatus.currentStage === STAGE.NEWSLETTER_SELECTION &&
        !newslettersLoading && (
          <NewsletterFormView
            formData={formData}
            formStatus={formStatus}
            newsletters={newsletters}
            fieldErrors={validationState.fieldErrors}
            hasAttemptedSubmit={validationState.hasAttemptedSubmit}
            errorSummaryRef={errorSummaryRef}
            onFirstNameChange={handleFirstNameChange}
            onLastNameChange={handleLastNameChange}
            onEmailChange={handleEmailChange}
            onConfirmEmailChange={handleConfirmEmailChange}
            onNewsletterToggle={handleNewsletterToggle}
            onMarketingEmailToggle={handleMarketingEmailToggle}
            onFieldBlur={handleFieldBlur}
            onSubmit={handleSubscribeSubmit}
          />
        )}

      {formStatus.currentStage === STAGE.CONFIRMATION && (
        <NewsletterConfirmationView
          email={formData.email}
          selectedNewsletters={formData.selectedNewsletters}
          newsletters={newsletters}
          formStatus={formStatus}
          selectedLevel={formData.learningLevel}
          learningLevels={LEARNING_LEVELS}
          onLevelSelect={handleLearningLevelSelect}
          onSave={handleLearningLevelSubmit}
          onSkip={() => handleLearningLevelSubmit(false)}
          isLoggedIn={formStatus.isLoggedIn}
          subscriptionDiffs={
            formStatus.isLoggedIn ? getSubscriptionDiffs() : null
          }
          marketingOptOut={!formData.wantsMarketingEmails}
        />
      )}

      {formStatus.currentStage === STAGE.SUCCESS && <SuccessView />}
    </div>
  );
}
