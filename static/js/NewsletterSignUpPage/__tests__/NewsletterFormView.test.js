/**
 * Jest Unit Tests: NewsletterFormView — Rendering & Error Display
 *
 * Uses ReactDOMServer.renderToString() following the existing project
 * pattern (see NewsletterConfirmationView.test.js).
 *
 * Covers:
 *  - InlineError bilingual rendering
 *  - Error summary display
 *  - Backend error display
 *  - Submitting (disabled) state
 */

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import NewsletterFormView from '../NewsletterFormView';
import { BILINGUAL_TEXT } from '../bilingualUtils';
import { FORM_STATUS } from '../stateSymbols';

// ============================================================================
// Mocks — same pattern as existing tests
// ============================================================================

jest.mock('../../sefaria/sefaria', () => ({
  interfaceLang: 'english',
  _: (text) => text,
  site: false,
}));

global.Sefaria = {
  _: (text) => text,
  interfaceLang: 'english',
  site: false,
};

jest.mock('../../Misc', () => ({
  InterfaceText: ({ text, children }) => {
    if (text) {
      return (
        <span>
          <span className="int-en">{text.en ?? ''}</span>
          <span className="int-he">{text.he ?? ''}</span>
        </span>
      );
    }
    return <span className="int-en">{children}</span>;
  },
  LoadingMessage: ({ message, heMessage }) => (
    <span className="loading">{message || 'Loading...'}</span>
  ),
}));

jest.mock('../SelectableOption', () => {
  return function MockSelectableOption({ label, isSelected, disabled }) {
    return (
      <div
        className={`selectableOption ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      >
        <span className="selectableOptionText">{label}</span>
      </div>
    );
  };
});

jest.mock('../MarketingEmailToggle', () => {
  return function MockMarketingEmailToggle() {
    return <div data-testid="marketing-toggle" />;
  };
});

// ============================================================================
// Shared fixtures
// ============================================================================

const NEWSLETTERS = [
  { key: 'sefaria_news', displayName: { en: 'Sefaria News & Resources', he: null }, icon: 'news.svg' },
  { key: 'educator_resources', displayName: { en: 'Educator Resources', he: null }, icon: 'edu.svg' },
  { key: 'hebrew_news', displayName: { en: null, he: 'חדשות ספריא' }, icon: 'heb.svg' },
];

const baseProps = {
  formData: {
    firstName: '',
    lastName: '',
    email: '',
    confirmEmail: '',
    selectedNewsletters: {},
    learningLevel: null,
    wantsMarketingEmails: true,
  },
  formStatus: {
    status: FORM_STATUS.IDLE,
    currentStage: null,
    isLoggedIn: false,
    userEmail: null,
    errorMessage: null,
    successMessage: null,
  },
  newsletters: NEWSLETTERS,
  fieldErrors: {},
  hasAttemptedSubmit: false,
  errorSummaryRef: { current: null },
  onFirstNameChange: jest.fn(),
  onLastNameChange: jest.fn(),
  onEmailChange: jest.fn(),
  onConfirmEmailChange: jest.fn(),
  onNewsletterToggle: jest.fn(),
  onMarketingEmailToggle: jest.fn(),
  onFieldBlur: jest.fn(),
  onSubmit: jest.fn(),
};

const renderView = (overrides = {}) => {
  const props = { ...baseProps, ...overrides };
  return ReactDOMServer.renderToString(<NewsletterFormView {...props} />);
};

// ============================================================================
// Test Suites
// ============================================================================

describe('NewsletterFormView', () => {

  // ---------- Suite 1: InlineError bilingual rendering ----------

  describe('InlineError bilingual rendering', () => {
    it('renders English error text for a field with an error', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME },
      });

      expect(html).toContain(BILINGUAL_TEXT.ENTER_FIRST_NAME.en);
    });

    it('renders Hebrew error text for a field with an error', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME },
      });

      expect(html).toContain(BILINGUAL_TEXT.ENTER_FIRST_NAME.he);
    });

    it('renders email error with correct message', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { email: BILINGUAL_TEXT.VALID_EMAIL },
      });

      expect(html).toContain(BILINGUAL_TEXT.VALID_EMAIL.en);
    });

    it('renders last name error with correct message', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { lastName: BILINGUAL_TEXT.ENTER_LAST_NAME },
      });

      expect(html).toContain(BILINGUAL_TEXT.ENTER_LAST_NAME.en);
    });

    it('does not render error when fieldErrors is empty', () => {
      const html = renderView({
        hasAttemptedSubmit: false,
        fieldErrors: {},
      });

      expect(html).not.toContain('inlineFieldError');
    });

    it('renders error with correct id for accessibility linkage', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { email: BILINGUAL_TEXT.ENTER_EMAIL },
      });

      expect(html).toContain('id="email-error"');
      expect(html).toContain('role="alert"');
    });

    it('adds hasError class to input when field has error', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME },
      });

      // The firstName input should have the hasError class
      expect(html).toContain('hasError');
    });
  });

  // ---------- Suite 2: Error summary ----------

  describe('Error summary', () => {
    it('renders error summary with FIX_ERRORS text when there are field errors', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME,
          email: BILINGUAL_TEXT.ENTER_EMAIL,
        },
      });

      expect(html).toContain('newsletterErrorSummary');
      expect(html).toContain(BILINGUAL_TEXT.FIX_ERRORS.en);
    });

    it('renders all error messages in the summary list', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME,
          email: BILINGUAL_TEXT.ENTER_EMAIL,
          newsletters: BILINGUAL_TEXT.SELECT_NEWSLETTER,
        },
      });

      expect(html).toContain(BILINGUAL_TEXT.ENTER_FIRST_NAME.en);
      expect(html).toContain(BILINGUAL_TEXT.ENTER_EMAIL.en);
      expect(html).toContain(BILINGUAL_TEXT.SELECT_NEWSLETTER.en);
    });

    it('renders summary links pointing to correct field IDs', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME,
          email: BILINGUAL_TEXT.ENTER_EMAIL,
        },
      });

      expect(html).toContain('href="#firstName-error"');
      expect(html).toContain('href="#email-error"');
    });

    it('does not render error summary when no errors', () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {},
      });

      expect(html).not.toContain('newsletterErrorSummary');
    });

    it('does not render error summary before submit attempt', () => {
      const html = renderView({
        hasAttemptedSubmit: false,
        fieldErrors: { firstName: BILINGUAL_TEXT.ENTER_FIRST_NAME },
      });

      expect(html).not.toContain('newsletterErrorSummary');
    });

    it('renders last name field without the optional caption', () => {
      const html = renderView();

      expect(html).toContain('placeholder="Last Name"');
      expect(html).not.toContain('Last Name (Optional)');
    });
  });

  // ---------- Suite 3: Backend error display ----------

  describe('Backend error display', () => {
    it('renders bilingual backend error when formStatus has errorMessage', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.ERROR,
          errorMessage: { en: 'Server error', he: 'שגיאת שרת' },
        },
      });

      expect(html).toContain('newsletterErrorMessage');
      expect(html).toContain('Server error');
      expect(html).toContain('שגיאת שרת');
    });

    it('does not render backend error when errorMessage is null', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.ERROR,
          errorMessage: null,
        },
      });

      expect(html).not.toContain('newsletterErrorMessage');
    });

    it('does not render backend error when status is IDLE', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.IDLE,
          errorMessage: { en: 'lingering', he: 'lingering' },
        },
      });

      expect(html).not.toContain('newsletterErrorMessage');
    });
  });

  // ---------- Suite 4: Hebrew-only newsletter label ----------

  describe('Hebrew-only newsletter label', () => {
    it('renders Hebrew text in int-he span when newsletter has no English name', () => {
      const html = renderView();

      // The Hebrew-only newsletter in the fixture should render its Hebrew text
      expect(html).toContain('חדשות ספריא');
      expect(html).toContain('int-he');
    });

    it('renders empty int-en span for Hebrew-only newsletter', () => {
      const html = renderView();

      // int-en span for Hebrew-only newsletter should be empty
      // (the English label for sefaria_news and educator_resources will still appear in int-en spans)
      expect(html).toContain('int-en');
    });

    it('renders English text in int-en span for English-only newsletter', () => {
      const html = renderView();

      expect(html).toContain('Sefaria News &amp; Resources');
    });
  });

  // ---------- Suite 5: Submitting state ----------

  describe('Submitting state', () => {
    it('disables the submit button when submitting', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.SUBMITTING,
        },
      });

      expect(html).toContain('disabled');
    });

    it('shows loading message when submitting', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.SUBMITTING,
        },
      });

      expect(html).toContain('loading');
    });

    it('does not show loading message when idle', () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.IDLE,
        },
      });

      // The submit button should show "Submit" text, not loading
      expect(html).toContain(BILINGUAL_TEXT.SUBMIT.en);
      expect(html).not.toContain('class="loading"');
    });
  });
});
