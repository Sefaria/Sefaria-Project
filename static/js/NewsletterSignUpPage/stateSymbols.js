/**
 * FORM_STATUS — Symbols for form submission state machine
 * Lifecycle: IDLE → SUBMITTING → SUCCESS | ERROR
 */
export const FORM_STATUS = Object.freeze({
  IDLE: Symbol("idle"),
  SUBMITTING: Symbol("submitting"),
  SUCCESS: Symbol("success"),
  ERROR: Symbol("error"),
});

/**
 * STAGE — Symbols for which view is currently rendered
 * Flow: NEWSLETTER_SELECTION → CONFIRMATION → SUCCESS
 */
export const STAGE = Object.freeze({
  NEWSLETTER_SELECTION: Symbol("newsletter_selection"),
  CONFIRMATION: Symbol("confirmation"),
  SUCCESS: Symbol("success"),
});

/**
 * FORM_STATUS_ACTION — Symbols for formStatusReducer action types
 * Consumed by formStatusReducer in NewsletterSignUpPageForm.jsx.
 */
export const FORM_STATUS_ACTION = Object.freeze({
  SUBMISSION_RESET: Symbol("submission_reset"),
  STAGE_ADVANCED: Symbol("stage_advanced"),
  SUBMIT_STARTED: Symbol("submit_started"),
  SUBMIT_SUCCEEDED: Symbol("submit_succeeded"),
  SUBMIT_FAILED: Symbol("submit_failed"),
});
