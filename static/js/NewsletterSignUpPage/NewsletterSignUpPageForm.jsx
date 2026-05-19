import React, { useState, useEffect, useRef, useReducer } from "react";
import Sefaria from "../sefaria/sefaria";
import { FORM_STATUS, STAGE, FORM_STATUS_ACTION } from "./stateSymbols";
import { BILINGUAL_TEXT, LEARNING_LEVELS } from "./bilingualUtils";
import { InterfaceText, LoadingMessage, LoadingRing } from "../Misc";
import NewsletterFormView from "./NewsletterFormView";
import NewsletterConfirmationView from "./NewsletterConfirmationView";
import SuccessView from "./SuccessView";
import { useNewsletterFormInit } from "./useNewsletterFormInit";
import { subscribeNewsletter, updatePreferences, updateLearningLevel } from "./newsletterApi";

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

function computeSubscriptionDiffs(initial, current) {
  const added = Object.keys(current).filter((key) => current[key] && !initial[key]);
  const removed = Object.keys(initial).filter((key) => initial[key] && !current[key]);
  return { added, removed };
}

const INITIAL_FORM_STATUS = {
  currentStage: STAGE.NEWSLETTER_SELECTION,
  status: FORM_STATUS.IDLE,
  errorMessage: null,
  isLoggedIn: false,
  userEmail: null,
};

/**
 * formStatusReducer — central state-machine transitions for the form lifecycle.
 *
 * Previously, each transition was an inline setFormStatus patch at the call site, e.g.:
 *
 *   setFormStatus((prev) => ({
 *     ...prev,
 *     status: FORM_STATUS.SUBMITTING,
 *     errorMessage: null,
 *   }));
 *
 * The patches were scattered across ~10 call sites and the full set of legal
 * transitions had to be reverse-engineered by reading every site. Centralizing
 * them here means a reader gets the complete machine from one switch statement.
 *
 * Action types live in stateSymbols.js (FORM_STATUS_ACTION) so typos surface as
 * `undefined` instead of silently failing to match a string case.
 */
function formStatusReducer(state, action) {
  switch (action.type) {
    case FORM_STATUS_ACTION.SUBMISSION_RESET:
      return { ...state, status: FORM_STATUS.IDLE, errorMessage: null };
    case FORM_STATUS_ACTION.STAGE_ADVANCED:
      return { ...state, currentStage: action.stage };
    case FORM_STATUS_ACTION.SUBMIT_STARTED:
      return { ...state, status: FORM_STATUS.SUBMITTING, errorMessage: null };
    case FORM_STATUS_ACTION.SUBMIT_SUCCEEDED:
      return { ...state, status: FORM_STATUS.SUCCESS, currentStage: action.nextStage };
    case FORM_STATUS_ACTION.SUBMIT_FAILED:
      return { ...state, status: FORM_STATUS.ERROR, errorMessage: action.error };
    default:
      return state;
  }
}

export default function NewsletterSignUpPageForm({ onStageChange }) {
  // ========== INIT HOOK ==========
  // Owns the loading lifecycle, fetched data, and baseline-for-diff ref.
  // Returns authState synchronously on first render so we can seed reducer + formData
  // with isLoggedIn/userEmail/email without an extra mount-time dispatch.
  const { authState, newsletters, newslettersLoading, serviceUnavailable, initialSubscriptionData, baselineRef } =
    useNewsletterFormInit();

  // ========== FORM DATA STATE ==========
  // Lazy initializer captures the logged-in user's email at first render.
  const [formData, setFormData] = useState(() => ({
    firstName: "",
    lastName: "",
    email: authState.userEmail ?? "",
    confirmEmail: "",
    selectedNewsletters: {},
    learningLevel: null,
    wantsMarketingEmails: true, // Default to opted-in for marketing emails
  }));

  // ========== FORM STATUS STATE (STATE MACHINE) ==========
  // Transitions are defined in formStatusReducer above — see it for the full list of actions.
  // Lazy initializer folds authState into the initial state so isLoggedIn/userEmail are
  // populated from the very first render — no dispatch-on-mount needed.
  const [formStatus, dispatchFormStatus] = useReducer(formStatusReducer, null, () => ({
    ...INITIAL_FORM_STATUS,
    ...authState,
  }));

  // ========== VALIDATION STATE ==========
  // Tracks per-field validation errors and whether user has attempted submit
  const [validationState, setValidationState] = useState({
    fieldErrors: {}, // { firstName: 'error', email: 'error', ... }
    hasAttemptedSubmit: false, // Only show errors after first submit attempt
  });

  // Ref for returning to the form title when validation fails.
  const formTitleRef = useRef(null);
  // Ref for scrolling to top of form section on stage transition
  const containerRef = useRef(null);
  // Prevent late API responses from setting state after navigation/unmount.
  // Tests exposed this lifecycle edge case, but it can also happen in production
  // when a user leaves the page before a submit or learning-level request finishes.
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Merge subscription data into form state when it arrives from the hook.
  useEffect(() => {
    if (initialSubscriptionData) {
      setFormData((prev) => ({ ...prev, ...initialSubscriptionData }));
    }
  }, [initialSubscriptionData]);

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

  // Core setter — applied directly by FormInput, which forwards its `id` via onChange(id, value).
  const handleFieldChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  // Curried variant for child components that don't forward a field id
  // (MarketingEmailToggle, learning-level select).
  const makeFieldSetter = (field) => (value) => handleFieldChange(field, value);

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

  // Shared lifecycle for any async submit: SUBMIT_STARTED → await → mount-guard → SUCCESS/FAIL.
  // The mount-guard exists because tests (and real users navigating away) can unmount the form
  // before the in-flight request resolves; without it, React warns about state on unmounted nodes.
  const runSubmission = async (apiCall, nextStage) => {
    dispatchFormStatus({ type: FORM_STATUS_ACTION.SUBMIT_STARTED });
    try {
      await apiCall();
      if (!isMountedRef.current) return;
      dispatchFormStatus({ type: FORM_STATUS_ACTION.SUBMIT_SUCCEEDED, nextStage });
    } catch (error) {
      if (!isMountedRef.current) return;
      dispatchFormStatus({ type: FORM_STATUS_ACTION.SUBMIT_FAILED, error: errorToBilingualMessage(error) });
    }
  };

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
      dispatchFormStatus({ type: FORM_STATUS_ACTION.SUBMISSION_RESET });

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
      const optOutChanged = formData.wantsMarketingEmails !== baselineRef.current.wantsMarketing;

      if (!hasSubscriptionChanges && !optOutChanged) {
        dispatchFormStatus({ type: FORM_STATUS_ACTION.STAGE_ADVANCED, stage: STAGE.CONFIRMATION });
        return;
      }
    }

    const apiCall = formStatus.isLoggedIn
      ? () =>
          updatePreferences(formData.selectedNewsletters, {
            marketingOptOut: !formData.wantsMarketingEmails,
          })
      : () =>
          subscribeNewsletter({
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            newsletters: formData.selectedNewsletters,
          });

    await runSubmission(apiCall, STAGE.CONFIRMATION);
  };

  const handleSaveLearningLevel = async () => {
    if (formData.learningLevel === null) {
      dispatchFormStatus({ type: FORM_STATUS_ACTION.SUBMIT_FAILED, error: BILINGUAL_TEXT.SELECT_LEARNING_LEVEL });
      return;
    }
    await runSubmission(() => updateLearningLevel(formData.email, formData.learningLevel), STAGE.SUCCESS);
  };

  const handleSkipLearningLevel = () => {
    // User clicked "No thanks" — go straight to the home page.
    window.location.href = "/";
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

  const getSubscriptionDiffs = () =>
    computeSubscriptionDiffs(baselineRef.current.subscriptions, formData.selectedNewsletters);

  // ========== RENDER: View routing based on current stage ==========

  const renderStageContent = () => {
    if (formStatus.currentStage === STAGE.NEWSLETTER_SELECTION) {
      if (newslettersLoading) {
        return (
          <div className="newsletterLoadingState">
            <LoadingRing />
            <LoadingMessage />
          </div>
        );
      }
      if (serviceUnavailable) {
        return (
          <div className="newsletterUnavailable">
            <InterfaceText
              text={{
                en: "Newsletter sign-up is not available right now.",
                he: "ההרשמה לניוזלטר אינה זמינה כרגע.",
              }}
            />
          </div>
        );
      }
      return (
        <NewsletterFormView
          formData={formData}
          formStatus={formStatus}
          newsletters={newsletters}
          fieldErrors={validationState.fieldErrors}
          hasAttemptedSubmit={validationState.hasAttemptedSubmit}
          formTitleRef={formTitleRef}
          onFieldChange={handleFieldChange}
          onNewsletterToggle={handleNewsletterToggle}
          onMarketingEmailToggle={handleMarketingEmailToggle}
          onFieldBlur={handleFieldBlur}
          onSubmit={handleSubscribeSubmit}
        />
      );
    }
    if (formStatus.currentStage === STAGE.CONFIRMATION) {
      return (
        <NewsletterConfirmationView
          email={formData.email}
          selectedNewsletters={formData.selectedNewsletters}
          newsletters={newsletters}
          formStatus={formStatus}
          selectedLevel={formData.learningLevel}
          learningLevels={LEARNING_LEVELS}
          onLevelSelect={handleLearningLevelSelect}
          onSave={handleSaveLearningLevel}
          onSkip={handleSkipLearningLevel}
          isLoggedIn={formStatus.isLoggedIn}
          subscriptionDiffs={formStatus.isLoggedIn ? getSubscriptionDiffs() : null}
          marketingOptOut={!formData.wantsMarketingEmails}
        />
      );
    }
    if (formStatus.currentStage === STAGE.SUCCESS) {
      return <SuccessView />;
    }
    return null;
  };

  return (
    <div className="newsletterSignUpPageForm" ref={containerRef}>
      {renderStageContent()}
    </div>
  );
}
