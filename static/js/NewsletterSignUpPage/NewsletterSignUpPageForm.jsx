import React, { useState, useEffect, useRef } from "react";
import Sefaria from "../sefaria/sefaria";
import { FORM_STATUS, STAGE } from "./stateSymbols";
import { BILINGUAL_TEXT, LEARNING_LEVELS } from "./bilingualUtils";
import { InterfaceText, LoadingMessage, LoadingRing } from "../Misc";
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
 */
function buildFieldValidators(formData, formStatus) {
  const isLoggedOut = !formStatus.isLoggedIn;
  const hasSelectedNewsletter = Object.values(formData.selectedNewsletters).some(Boolean);

  return {
    firstName: () => (isLoggedOut && !formData.firstName.trim() ? BILINGUAL_TEXT.ENTER_FIRST_NAME : null),
    lastName: () => (isLoggedOut && !formData.lastName.trim() ? BILINGUAL_TEXT.ENTER_LAST_NAME : null),
    email: () => {
      if (!formData.email.trim()) return BILINGUAL_TEXT.ENTER_EMAIL;
      if (!Sefaria.util.isValidEmailAddress(formData.email)) return BILINGUAL_TEXT.VALID_EMAIL;
      return null;
    },
    confirmEmail: () =>
      isLoggedOut && formData.email !== formData.confirmEmail ? BILINGUAL_TEXT.EMAILS_MISMATCH : null,
    newsletters: () => (isLoggedOut && !hasSelectedNewsletter ? BILINGUAL_TEXT.SELECT_NEWSLETTER : null),
  };
}

function errorToBilingualMessage(error) {
  return error.message ? { en: error.message, he: error.message } : BILINGUAL_TEXT.GENERIC_ERROR;
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
  const [newsletters, setNewsletters] = useState([]);
  const [newslettersLoading, setNewslettersLoading] = useState(true);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  // Ref for returning to the form title when validation fails.
  const formTitleRef = useRef(null);
  // Ref for scrolling to top of form section on stage transition
  const containerRef = useRef(null);
  // Prevent late API responses from setting state after navigation/unmount.
  // Tests exposed this lifecycle edge case, but it can also happen in production
  // when a user leaves the page before a submit or learning-level request finishes.
  const isMountedRef = useRef(false);

  // Baseline snapshots for computing subscription diffs (logged-in users only).
  // Refs because these are write-once values that never drive rendering.
  const initialSubscriptionsRef = useRef({});
  const initialWantsMarketingRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ========== INITIALIZATION: Detect authentication status ==========
  useEffect(() => {
    let isMounted = true;
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
          if (!isMounted) return;
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
          console.error("Failed to fetch newsletter lists:", error);
          if (!isMounted) return;
          setServiceUnavailable(true);
        }),
    ];

    if (isLoggedIn) {
      promises.push(
        fetchUserSubscriptions(userEmail)
          .then((response) => {
            if (!isMounted) return;
            if (response.success && response.subscribedNewsletters) {
              const selectedNewsletters = {};
              response.subscribedNewsletters.forEach((key) => {
                selectedNewsletters[key] = true;
              });

              // Active managed subscriptions imply marketing emails are enabled;
              // guard against stale or mocked opt-out flags saying otherwise.
              const backendWantsMarketing = response.wantsMarketingEmails ?? true;
              const hasActiveManagedSubscription = response.subscribedNewsletters.length > 0;
              const effectiveWantsMarketing = backendWantsMarketing || hasActiveManagedSubscription;

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
    Promise.all(promises).finally(() => {
      if (isMounted) setNewslettersLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Revalidate newsletter selection reactively after submit has been attempted.
  // This runs after render, so formData.selectedNewsletters is always fresh
  useEffect(() => {
    if (!validationState.hasAttemptedSubmit) return;
    setValidationState((prev) => {
      const newsletterError = buildFieldValidators(formData, formStatus).newsletters();
      if (prev.fieldErrors.newsletters === newsletterError) return prev;

      const newErrors = { ...prev.fieldErrors };
      if (newsletterError) {
        newErrors.newsletters = newsletterError;
      } else {
        delete newErrors.newsletters;
      }
      return { ...prev, fieldErrors: newErrors };
    });
  }, [formData.selectedNewsletters, validationState.hasAttemptedSubmit, formStatus.isLoggedIn]);

  useEffect(() => {
    onStageChange?.(formStatus.currentStage);
  }, [formStatus.currentStage, onStageChange]);

  // Effects run after React commits the new stage, so this scroll can happen immediately.
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

  const makeFieldSetter = (field) => (value) => setFormData((prev) => ({ ...prev, [field]: value }));

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
    if (!validator) return;

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
      if (fieldName === "email" && (formData.confirmEmail !== "" || newErrors.confirmEmail)) {
        const confirmError = fieldValidators.confirmEmail();
        if (confirmError) {
          newErrors.confirmEmail = confirmError;
        } else {
          delete newErrors.confirmEmail;
        }
      }
      return { ...prev, fieldErrors: newErrors };
    });
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
      // Client-side validation errors live in fieldErrors; clear any stale API-level error.
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.IDLE,
        errorMessage: null,
      }));

      // Defer until validation errors render; the title is a cleaner scroll target than the summary.
      setTimeout(() => {
        formTitleRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      return;
    }

    // For logged-in users: skip API call if nothing actually changed
    if (formStatus.isLoggedIn) {
      const diffs = getSubscriptionDiffs();
      const hasSubscriptionChanges = diffs.added.length > 0 || diffs.removed.length > 0;
      const optOutChanged = formData.wantsMarketingEmails !== initialWantsMarketingRef.current;

      if (!hasSubscriptionChanges && !optOutChanged) {
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

    try {
      if (formStatus.isLoggedIn) {
        // For logged-in users: update preferences
        // Pass marketingOptOut flag to indicate intent when newsletters is empty
        await updatePreferences(formStatus.userEmail, formData.selectedNewsletters, {
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

      // The user may have navigated away while the API request was in flight.
      if (!isMountedRef.current) return;

      // Success! Move to confirmation view
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.SUCCESS,
        currentStage: STAGE.CONFIRMATION,
      }));
    } catch (error) {
      if (!isMountedRef.current) return;

      // Error during submission
      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: errorToBilingualMessage(error),
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

      // The user may have navigated away while the API request was in flight.
      if (!isMountedRef.current) return;

      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.SUCCESS,
        currentStage: STAGE.SUCCESS,
      }));
    } catch (error) {
      if (!isMountedRef.current) return;

      setFormStatus((prev) => ({
        ...prev,
        status: FORM_STATUS.ERROR,
        errorMessage: errorToBilingualMessage(error),
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

    const added = Object.keys(current).filter((key) => current[key] && !initial[key]);
    const removed = Object.keys(initial).filter((key) => initial[key] && !current[key]);

    return { added, removed };
  };

  // ========== RENDER: View routing based on current stage ==========

  const isNewsletterSelectionStage = formStatus.currentStage === STAGE.NEWSLETTER_SELECTION;
  const isConfirmationStage = formStatus.currentStage === STAGE.CONFIRMATION;
  const isSuccessStage = formStatus.currentStage === STAGE.SUCCESS;
  const showNewsletterLoading = isNewsletterSelectionStage && newslettersLoading;
  const showServiceUnavailable = isNewsletterSelectionStage && !newslettersLoading && serviceUnavailable;
  const showNewsletterForm = isNewsletterSelectionStage && !newslettersLoading && !serviceUnavailable;

  return (
    <div className="newsletterSignUpPageForm" ref={containerRef}>
      {showNewsletterLoading && (
        <div className="newsletterLoadingState">
          <LoadingRing />
          <LoadingMessage />
        </div>
      )}

      {showServiceUnavailable && (
        <div className="newsletterUnavailable">
          <InterfaceText
            text={{
              en: "Newsletter sign-up is not available right now.",
              he: "ההרשמה לניוזלטר אינה זמינה כרגע.",
            }}
          />
        </div>
      )}

      {showNewsletterForm && (
        <NewsletterFormView
          formData={formData}
          formStatus={formStatus}
          newsletters={newsletters}
          fieldErrors={validationState.fieldErrors}
          hasAttemptedSubmit={validationState.hasAttemptedSubmit}
          formTitleRef={formTitleRef}
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

      {isConfirmationStage && (
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
          subscriptionDiffs={formStatus.isLoggedIn ? getSubscriptionDiffs() : null}
          marketingOptOut={!formData.wantsMarketingEmails}
        />
      )}

      {isSuccessStage && <SuccessView />}
    </div>
  );
}
