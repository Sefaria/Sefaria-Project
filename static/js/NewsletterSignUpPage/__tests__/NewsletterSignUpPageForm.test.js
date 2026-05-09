/**
 * Jest Unit Tests: NewsletterSignUpPageForm — Container Component
 *
 * Tests the state-machine logic, field validation, newsletter revalidation
 * useEffect (the stale-closure bug fix), and submit flows for both
 * logged-out and logged-in users.
 *
 * Strategy: "mock-and-capture props"
 *   - Child view components are replaced with lightweight mocks that store
 *     the props they receive on each render.
 *   - ReactDOM.render() + act() drives the container through state changes.
 *   - We inspect the captured props to verify state transitions.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { FORM_STATUS, STAGE, NEWSLETTERS } from '../constants';
import { BILINGUAL_TEXT } from '../bilingualUtils';

// ============================================================================
// Mocks — must be declared before the component import
// ============================================================================

// --- Sefaria global ---
jest.mock('../../sefaria/sefaria', () => ({
  _uid: 0,
  _email: null,
  interfaceLang: 'english',
  _: (text) => text,
  util: {
    isValidEmailAddress: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  },
  site: false,
}));

// Keep a handle so individual tests can toggle logged-in state
const Sefaria = require('../../sefaria/sefaria');

// --- Newsletter API ---
// We mock the *module* so the named exports resolve to jest.fn()s.
jest.mock('../newsletterApi', () => {
  const sub = jest.fn(() => Promise.resolve({ success: true }));
  const upd = jest.fn(() => Promise.resolve({ success: true }));
  const lvl = jest.fn(() => Promise.resolve({ success: true }));
  const fetch_ = jest.fn(() => Promise.resolve({
    success: true,
    subscribedNewsletters: [],
    wantsMarketingEmails: true,
    learningLevel: null,
  }));
  const lists = jest.fn(() => Promise.resolve({ newsletters: [] }));

  return {
    __esModule: true,
    default: {},
    subscribeNewsletter: sub,
    updatePreferences: upd,
    updateLearningLevel: lvl,
    fetchUserSubscriptions: fetch_,
    getNewsletterLists: lists,
  };
});

const {
  subscribeNewsletter,
  updatePreferences,
  fetchUserSubscriptions,
  getNewsletterLists,
} = require('../newsletterApi');

// --- Child view components: capture props on every render ---
let lastFormViewProps = {};
jest.mock('../NewsletterFormView', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function MockFormView(props) {
      lastFormViewProps = props;
      return React.createElement('div', { 'data-testid': 'form-view' });
    },
  };
});

let lastConfirmationViewProps = {};
jest.mock('../NewsletterConfirmationView', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function MockConfirmationView(props) {
      lastConfirmationViewProps = props;
      return React.createElement('div', { 'data-testid': 'confirmation-view' });
    },
  };
});

jest.mock('../SuccessView', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function MockSuccessView() {
      return React.createElement('div', { 'data-testid': 'success-view' });
    },
  };
});

jest.mock('../../Misc', () => ({
  LoadingMessage: () => null,
  LoadingRing: () => null,
}));

// --- Import the component under test AFTER all mocks ---
const NewsletterSignUpPageForm = require('../NewsletterSignUpPageForm').default;

// ============================================================================
// Helpers
// ============================================================================

let container;
let stageChangeSpy;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);

  // Reset to logged-out state
  Sefaria._uid = 0;
  Sefaria._email = null;

  lastFormViewProps = {};
  lastConfirmationViewProps = {};
  stageChangeSpy = jest.fn();

  jest.clearAllMocks();
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.removeChild(container);
  container = null;
});

/** Render (or re-render) the form and flush all pending promises. */
const renderForm = async (props = {}) => {
  act(() => {
    ReactDOM.render(React.createElement(NewsletterSignUpPageForm, props), container);
  });
  await flushPromises();
};

/** Flush a microtask (resolved promise) inside act(). */
const flushPromises = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

// ============================================================================
// Test Suites
// ============================================================================

describe('NewsletterSignUpPageForm', () => {

  // ---------- Suite 1: Initial state ----------

  describe('Initial state (logged-out)', () => {
    it('starts with IDLE status and NEWSLETTER_SELECTION stage', async () => {
      await renderForm();

      expect(lastFormViewProps.formStatus.status).toBe(FORM_STATUS.IDLE);
      expect(lastFormViewProps.formStatus.currentStage).toBe(STAGE.NEWSLETTER_SELECTION);
    });

    it('starts with empty fieldErrors', async () => {
      await renderForm();

      expect(lastFormViewProps.fieldErrors).toEqual({});
    });

    it('starts with default formData values', async () => {
      await renderForm();

      const fd = lastFormViewProps.formData;
      expect(fd.firstName).toBe('');
      expect(fd.lastName).toBe('');
      expect(fd.email).toBe('');
      expect(fd.confirmEmail).toBe('');
      expect(fd.selectedNewsletters).toEqual({});
      expect(fd.learningLevel).toBeNull();
      expect(fd.wantsMarketingEmails).toBe(true);
    });

    it('hasAttemptedSubmit starts as false', async () => {
      await renderForm();

      expect(lastFormViewProps.hasAttemptedSubmit).toBe(false);
    });

    it('notifies parent of initial NEWSLETTER_SELECTION stage', async () => {
      await renderForm({ onStageChange: stageChangeSpy });

      expect(stageChangeSpy).toHaveBeenCalledWith(STAGE.NEWSLETTER_SELECTION);
    });
  });

  // ---------- Suite 2: Validation — logged-out submit with empty form ----------

  describe('Validation — logged-out submit with empty form', () => {
    it('produces errors for firstName, lastName, email, and newsletters (confirmEmail matches when both empty)', async () => {
      await renderForm();
      await act(async () => { lastFormViewProps.onSubmit(); });

      const errors = lastFormViewProps.fieldErrors;
      // When both email and confirmEmail are '', they match → no mismatch error.
      // Only 4 fields fail: firstName, lastName, email, newsletters.
      expect(Object.keys(errors)).toHaveLength(4);
      expect(errors).toHaveProperty('firstName');
      expect(errors).toHaveProperty('lastName');
      expect(errors).toHaveProperty('email');
      expect(errors).toHaveProperty('newsletters');
      expect(errors).not.toHaveProperty('confirmEmail');
    });

    it('each error is a bilingual {en, he} object', async () => {
      await renderForm();
      await act(async () => { lastFormViewProps.onSubmit(); });

      const errors = lastFormViewProps.fieldErrors;
      Object.values(errors).forEach((err) => {
        expect(err).toHaveProperty('en');
        expect(err).toHaveProperty('he');
        expect(typeof err.en).toBe('string');
        expect(typeof err.he).toBe('string');
      });
    });

    it('sets formStatus.status to ERROR', async () => {
      await renderForm();
      await act(async () => { lastFormViewProps.onSubmit(); });

      expect(lastFormViewProps.formStatus.status).toBe(FORM_STATUS.ERROR);
    });
  });

  // ---------- Suite 3: Validation — individual field errors ----------

  describe('Validation — individual field errors', () => {
    /** Helper: fill form, override specific fields, then submit. */
    const submitWithOverrides = async (overrides = {}) => {
      await renderForm();

      // Start with a valid baseline
      const valid = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        confirmEmail: 'ada@example.com',
        newsletter: 'sefaria_news',
      };
      const merged = { ...valid, ...overrides };

      // Apply field values through the handler props
      act(() => { lastFormViewProps.onFirstNameChange(merged.firstName); });
      act(() => { lastFormViewProps.onLastNameChange(merged.lastName); });
      act(() => { lastFormViewProps.onEmailChange(merged.email); });
      act(() => { lastFormViewProps.onConfirmEmailChange(merged.confirmEmail); });
      if (merged.newsletter) {
        act(() => { lastFormViewProps.onNewsletterToggle(merged.newsletter); });
      }

      await act(async () => { lastFormViewProps.onSubmit(); });
      return lastFormViewProps.fieldErrors;
    };

    it('missing first name → ENTER_FIRST_NAME', async () => {
      const errors = await submitWithOverrides({ firstName: '' });
      expect(errors.firstName).toBe(BILINGUAL_TEXT.ENTER_FIRST_NAME);
    });

    it('missing last name → ENTER_LAST_NAME', async () => {
      const errors = await submitWithOverrides({ lastName: '' });
      expect(errors.lastName).toBe(BILINGUAL_TEXT.ENTER_LAST_NAME);
    });

    it('invalid email format → VALID_EMAIL', async () => {
      const errors = await submitWithOverrides({ email: 'not-an-email', confirmEmail: 'not-an-email' });
      expect(errors.email).toBe(BILINGUAL_TEXT.VALID_EMAIL);
    });

    it('mismatched emails → EMAILS_MISMATCH', async () => {
      const errors = await submitWithOverrides({
        email: 'ada@example.com',
        confirmEmail: 'different@example.com',
      });
      expect(errors.confirmEmail).toBe(BILINGUAL_TEXT.EMAILS_MISMATCH);
    });

    it('no newsletters selected → SELECT_NEWSLETTER', async () => {
      const errors = await submitWithOverrides({ newsletter: null });
      expect(errors.newsletters).toBe(BILINGUAL_TEXT.SELECT_NEWSLETTER);
    });

    it('valid form produces empty fieldErrors', async () => {
      const errors = await submitWithOverrides({});
      expect(errors).toEqual({});
    });

    it('blurring email clears stale confirmEmail mismatch error when emails now match', async () => {
      // Submit with mismatched emails → hasAttemptedSubmit=true, confirmEmail error set
      await submitWithOverrides({ email: 'ada@example.com', confirmEmail: 'different@example.com' });
      expect(lastFormViewProps.fieldErrors.confirmEmail).toBe(BILINGUAL_TEXT.EMAILS_MISMATCH);

      // User fixes email to match the already-typed confirmEmail value
      act(() => { lastFormViewProps.onEmailChange('different@example.com'); });

      // Blurring email should re-evaluate confirmEmail in the same state update
      act(() => { lastFormViewProps.onFieldBlur('email'); });

      expect(lastFormViewProps.fieldErrors.confirmEmail).toBeUndefined();
    });
  });

  // ---------- Suite 4: Newsletter revalidation useEffect ----------

  describe('Newsletter revalidation useEffect (stale-closure bug fix)', () => {
    it('clears newsletter error when a newsletter is toggled on', async () => {
      await renderForm();

      // Submit empty form → newsletter error appears
      await act(async () => { lastFormViewProps.onSubmit(); });
      expect(lastFormViewProps.fieldErrors.newsletters).toBe(BILINGUAL_TEXT.SELECT_NEWSLETTER);

      // Toggle a newsletter ON
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      // The useEffect should clear the error after a single toggle
      expect(lastFormViewProps.fieldErrors.newsletters).toBeUndefined();
    });

    it('restores newsletter error when all newsletters are toggled off', async () => {
      await renderForm();

      // Submit empty → error
      await act(async () => { lastFormViewProps.onSubmit(); });
      expect(lastFormViewProps.fieldErrors.newsletters).toBeDefined();

      // Toggle ON → error clears
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });
      expect(lastFormViewProps.fieldErrors.newsletters).toBeUndefined();

      // Toggle OFF → error returns
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });
      expect(lastFormViewProps.fieldErrors.newsletters).toBe(BILINGUAL_TEXT.SELECT_NEWSLETTER);
    });

    it('does not run revalidation before submit has been attempted', async () => {
      await renderForm();

      // Toggle without submitting first
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); }); // toggle off

      // No error should appear because hasAttemptedSubmit is false
      expect(lastFormViewProps.fieldErrors).toEqual({});
    });
  });

  // ---------- Suite 5: Submit flow — logged-out success ----------

  describe('Submit flow — logged-out success', () => {
    it('transitions IDLE → SUBMITTING → SUCCESS → CONFIRMATION stage', async () => {
      subscribeNewsletter.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 0))
      );

      await renderForm();

      // Fill valid form
      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      // Trigger submit — capture the SUBMITTING state
      let submitPromise;
      act(() => { submitPromise = lastFormViewProps.onSubmit(); });

      // During the async call the status should be SUBMITTING
      expect(lastFormViewProps.formStatus.status).toBe(FORM_STATUS.SUBMITTING);

      // Wait for the promise to resolve
      await act(async () => { await submitPromise; });

      // After success, the container renders ConfirmationView instead of FormView
      expect(lastConfirmationViewProps.formStatus.status).toBe(FORM_STATUS.SUCCESS);
      expect(lastConfirmationViewProps.formStatus.currentStage).toBe(STAGE.CONFIRMATION);
    });

    it('calls subscribeNewsletter with correct args', async () => {
      await renderForm();

      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      await act(async () => { lastFormViewProps.onSubmit(); });

      expect(subscribeNewsletter).toHaveBeenCalledWith({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        newsletters: { sefaria_news: true },
      });
    });

    it('notifies parent when stage changes to CONFIRMATION', async () => {
      await renderForm({ onStageChange: stageChangeSpy });

      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      await act(async () => { await lastFormViewProps.onSubmit(); });
      await flushPromises();

      expect(stageChangeSpy).toHaveBeenLastCalledWith(STAGE.CONFIRMATION);
    });
  });

  // ---------- Suite 6: Submit flow — API error ----------

  describe('Submit flow — API error', () => {
    it('sets ERROR status with bilingual errorMessage on rejection', async () => {
      subscribeNewsletter.mockRejectedValueOnce(new Error('Server unavailable'));

      await renderForm();

      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      await act(async () => { lastFormViewProps.onSubmit(); });

      expect(lastFormViewProps.formStatus.status).toBe(FORM_STATUS.ERROR);
      expect(lastFormViewProps.formStatus.errorMessage).toEqual({
        en: 'Server unavailable',
        he: 'Server unavailable',
      });
    });

    it('uses GENERIC_ERROR when error has no message', async () => {
      subscribeNewsletter.mockRejectedValueOnce(new Error());

      await renderForm();

      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      await act(async () => { lastFormViewProps.onSubmit(); });

      expect(lastFormViewProps.formStatus.errorMessage).toBe(BILINGUAL_TEXT.GENERIC_ERROR);
    });
  });

  // ---------- Suite 7: Logged-in — no newsletter validation ----------

  describe('Logged-in — no newsletter validation', () => {
    it('does not require newsletter selection for logged-in users', async () => {
      Sefaria._uid = 1;
      Sefaria._email = 'user@example.com';

      await renderForm();

      // Submit with no newsletters and no other errors (email is pre-filled)
      await act(async () => { lastFormViewProps.onSubmit(); });

      expect(lastFormViewProps.fieldErrors).not.toHaveProperty('newsletters');
      // Should also not require firstName or confirmEmail for logged-in
      expect(lastFormViewProps.fieldErrors).not.toHaveProperty('firstName');
      expect(lastFormViewProps.fieldErrors).not.toHaveProperty('confirmEmail');
    });
  });

  // ---------- Suite 8: Logged-in — skip API when no changes ----------

  describe('Logged-in — skip API when no changes', () => {
    it('moves to CONFIRMATION without calling updatePreferences', async () => {
      Sefaria._uid = 1;
      Sefaria._email = 'user@example.com';

      // Mock fetchUserSubscriptions to return existing subscriptions
      fetchUserSubscriptions.mockResolvedValueOnce({
        success: true,
        subscribedNewsletters: ['sefaria_news'],
        wantsMarketingEmails: true,
        learningLevel: null,
      });

      await renderForm();

      // formData should now have sefaria_news pre-selected and email pre-filled
      // Submit without changing anything
      await act(async () => { lastFormViewProps.onSubmit(); });

      // Should go straight to confirmation without calling API
      expect(updatePreferences).not.toHaveBeenCalled();
      expect(lastConfirmationViewProps.formStatus.currentStage).toBe(STAGE.CONFIRMATION);
    });
  });

  describe('Final success stage notifications', () => {
    it('skipping learning level navigates to homepage rather than SUCCESS stage', async () => {
      // Skipping navigates away via window.location.href — stage stays at CONFIRMATION.
      // STAGE.SUCCESS is only reached by saving a learning level.
      const originalHref = window.location.href;
      delete window.location;
      window.location = { href: originalHref };

      await renderForm({ onStageChange: stageChangeSpy });

      act(() => { lastFormViewProps.onFirstNameChange('Ada'); });
      act(() => { lastFormViewProps.onLastNameChange('Lovelace'); });
      act(() => { lastFormViewProps.onEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onConfirmEmailChange('ada@example.com'); });
      act(() => { lastFormViewProps.onNewsletterToggle('sefaria_news'); });

      await act(async () => { await lastFormViewProps.onSubmit(); });
      await flushPromises();
      await act(async () => { lastConfirmationViewProps.onSkip(); });
      await flushPromises();

      expect(window.location.href).toBe('/');
      expect(stageChangeSpy).toHaveBeenLastCalledWith(STAGE.CONFIRMATION);
    });
  });
});

// ============================================================================
// Suite 9: getNewsletterLists failure → falls back to NEWSLETTERS constant
// ============================================================================

describe('Suite 9: getNewsletterLists failure falls back to NEWSLETTERS constant', () => {
  beforeEach(() => {
    getNewsletterLists.mockReturnValueOnce(Promise.reject(new Error('Service down')));
  });

  it('still renders the form after lists API failure', async () => {
    await renderForm();
    expect(lastFormViewProps.newsletters).toBeDefined();
  });

  it('uses NEWSLETTERS constant as fallback when lists API rejects', async () => {
    await renderForm();
    // Catch fires without calling setNewsletters — state stays at useState(NEWSLETTERS)
    expect(lastFormViewProps.newsletters).toEqual(NEWSLETTERS);
  });
});

// ============================================================================
// Suite 10: fetchUserSubscriptions failure — logged-in form still renders
// ============================================================================

describe('Suite 10: fetchUserSubscriptions failure — form still renders for logged-in users', () => {
  beforeEach(() => {
    Sefaria._uid = 1;
    Sefaria._email = 'user@example.com';
    fetchUserSubscriptions.mockReturnValueOnce(Promise.reject(new Error('Unauthorized')));
  });
  afterEach(() => {
    Sefaria._uid = 0;
    Sefaria._email = null;
  });

  it('renders the form even when subscriptions API fails', async () => {
    await renderForm();
    expect(lastFormViewProps.formData).toBeDefined();
  });

  it('selectedNewsletters defaults to empty object on subscriptions failure', async () => {
    await renderForm();
    expect(lastFormViewProps.formData.selectedNewsletters).toEqual({});
  });
});

// ============================================================================
// Suite 11: Stale opt-out detection
// ============================================================================

describe('Suite 11: stale opt-out detection', () => {
  beforeEach(() => {
    Sefaria._uid = 1;
    Sefaria._email = 'user@example.com';
  });
  afterEach(() => {
    Sefaria._uid = 0;
    Sefaria._email = null;
  });

  it('corrects wantsMarketingEmails to true when opted-out but has active subscriptions', async () => {
    fetchUserSubscriptions.mockReturnValueOnce(Promise.resolve({
      success: true,
      subscribedNewsletters: ['sefaria_news'],
      wantsMarketingEmails: false,
      learningLevel: null,
    }));
    await renderForm();
    expect(lastFormViewProps.formData.wantsMarketingEmails).toBe(true);
  });

  it('preserves wantsMarketingEmails=false when opted-out and no active subscriptions', async () => {
    fetchUserSubscriptions.mockReturnValueOnce(Promise.resolve({
      success: true,
      subscribedNewsletters: [],
      wantsMarketingEmails: false,
      learningLevel: null,
    }));
    await renderForm();
    expect(lastFormViewProps.formData.wantsMarketingEmails).toBe(false);
  });
});
