/**
 * FORM_STATUS — Symbols for form submission state machine
 * Lifecycle: IDLE → SUBMITTING → SUCCESS | ERROR
 */
export const FORM_STATUS = Object.freeze({
  IDLE:       Symbol('idle'),
  SUBMITTING: Symbol('submitting'),
  SUCCESS:    Symbol('success'),
  ERROR:      Symbol('error'),
});

/**
 * STAGE — Symbols for which view is currently rendered
 * Flow: NEWSLETTER_SELECTION → CONFIRMATION → SUCCESS
 */
export const STAGE = Object.freeze({
  NEWSLETTER_SELECTION: Symbol('newsletter_selection'),
  CONFIRMATION:         Symbol('confirmation'),
  SUCCESS:              Symbol('success'),
});
