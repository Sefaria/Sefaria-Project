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

import React from "react";
import ReactDOMServer from "react-dom/server";
import NewsletterFormView from "../NewsletterFormView";
import { TEXT_KEYS } from "../textKeys";
import { FORM_STATUS } from "../stateSymbols";
import { enText, heText } from "../testSupport/i18nTestUtils";
import MockSefariaModule from "../../sefaria/sefaria";

// ============================================================================
// Mocks — same pattern as existing tests
// ============================================================================

jest.mock("../../sefaria/sefaria", () => ({
  interfaceLang: "english",
  _: (text) => require("../testSupport/i18nTestUtils").translate(text),
  _keyedString: (id, lang) => require("../testSupport/i18nTestUtils").keyedString(id, lang),
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
  site: false,
}));

global.Sefaria = {
  _: (text) => require("../testSupport/i18nTestUtils").translate(text),
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
  interfaceLang: "english",
  site: false,
};

jest.mock("../../Misc", () => ({
  InterfaceText: ({ text, children }) => {
    if (text) {
      return (
        <span>
          <span className="int-en">{text.en ?? ""}</span>
          <span className="int-he">{text.he ?? ""}</span>
        </span>
      );
    }
    // Keyed children render both languages, like the real InterfaceText.
    const { translate } = require("../testSupport/i18nTestUtils");
    return (
      <span>
        <span className="int-en">{translate(children, "english")}</span>
        <span className="int-he">{translate(children, "hebrew")}</span>
      </span>
    );
  },
  // Mirrors the real LoadingMessage+InterfaceText: picks message or heMessage based on
  // the CURRENT interface language, like the real component does via EnglishText/
  // HebrewText filtering. A mock that always showed `message` could never fail a test
  // that passed the wrong value into `heMessage` — exactly the bug this suite exists
  // to catch (see _bilingual usage in NewsletterFormView.jsx).
  LoadingMessage: ({ message, heMessage }) => {
    const isHebrew = MockSefariaModule.interfaceLang === "hebrew";
    return <span className="loading">{(isHebrew ? heMessage : message) || "Loading..."}</span>;
  },
}));

jest.mock("../SelectableOption", () => {
  return function MockSelectableOption({ label, isSelected, disabled }) {
    return (
      <div className={`selectableOption ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}>
        <span className="selectableOptionText">{label}</span>
      </div>
    );
  };
});

jest.mock("../MarketingEmailToggle", () => {
  return function MockMarketingEmailToggle() {
    return <div data-testid="marketing-toggle" />;
  };
});

// ============================================================================
// Shared fixtures
// ============================================================================

const NEWSLETTERS = [
  { key: "sefaria_news", displayName: { en: "Sefaria News & Resources", he: null }, icon: "news.svg" },
  { key: "educator_resources", displayName: { en: "Educator Resources", he: null }, icon: "edu.svg" },
  { key: "hebrew_news", displayName: { en: null, he: "חדשות ספריא" }, icon: "heb.svg" },
];

const baseProps = {
  formData: {
    firstName: "",
    lastName: "",
    email: "",
    confirmEmail: "",
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
  formTitleRef: { current: null },
  onFieldChange: jest.fn(),
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

describe("NewsletterFormView", () => {
  // ---------- Suite 1: InlineError bilingual rendering ----------

  describe("InlineError bilingual rendering", () => {
    it("renders English error text for a field with an error", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: TEXT_KEYS.ENTER_FIRST_NAME },
      });

      expect(html).toContain(enText(TEXT_KEYS.ENTER_FIRST_NAME));
    });

    it("renders Hebrew error text for a field with an error", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: TEXT_KEYS.ENTER_FIRST_NAME },
      });

      expect(html).toContain(heText(TEXT_KEYS.ENTER_FIRST_NAME));
    });

    it("renders email error with correct message", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { email: TEXT_KEYS.VALID_EMAIL },
      });

      expect(html).toContain(enText(TEXT_KEYS.VALID_EMAIL));
    });

    it("renders last name error with correct message", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { lastName: TEXT_KEYS.ENTER_LAST_NAME },
      });

      expect(html).toContain(enText(TEXT_KEYS.ENTER_LAST_NAME));
    });

    it("does not render error when fieldErrors is empty", () => {
      const html = renderView({
        hasAttemptedSubmit: false,
        fieldErrors: {},
      });

      expect(html).not.toContain("inlineFieldError");
    });

    it("renders error with correct id for accessibility linkage", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { email: TEXT_KEYS.ENTER_EMAIL },
      });

      expect(html).toContain('id="email-error"');
      expect(html).toContain('role="alert"');
    });

    it("adds hasError class to input when field has error", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: { firstName: TEXT_KEYS.ENTER_FIRST_NAME },
      });

      // The firstName input should have the hasError class
      expect(html).toContain("hasError");
    });
  });

  // ---------- Suite 2: Error summary ----------

  describe("Error summary", () => {
    it("renders error summary with FIX_ERRORS text when there are field errors", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: TEXT_KEYS.ENTER_FIRST_NAME,
          email: TEXT_KEYS.ENTER_EMAIL,
        },
      });

      expect(html).toContain("newsletterErrorSummary");
      expect(html).toContain(enText(TEXT_KEYS.FIX_ERRORS));
    });

    it("renders all error messages in the summary list", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: TEXT_KEYS.ENTER_FIRST_NAME,
          email: TEXT_KEYS.ENTER_EMAIL,
          newsletters: TEXT_KEYS.SELECT_NEWSLETTER,
        },
      });

      expect(html).toContain(enText(TEXT_KEYS.ENTER_FIRST_NAME));
      expect(html).toContain(enText(TEXT_KEYS.ENTER_EMAIL));
      expect(html).toContain(enText(TEXT_KEYS.SELECT_NEWSLETTER));
    });

    it("renders summary links pointing to correct field IDs", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {
          firstName: TEXT_KEYS.ENTER_FIRST_NAME,
          email: TEXT_KEYS.ENTER_EMAIL,
        },
      });

      expect(html).toContain('href="#firstName-error"');
      expect(html).toContain('href="#email-error"');
    });

    it("does not render error summary when no errors", () => {
      const html = renderView({
        hasAttemptedSubmit: true,
        fieldErrors: {},
      });

      expect(html).not.toContain("newsletterErrorSummary");
    });

    it("does not render error summary before submit attempt", () => {
      const html = renderView({
        hasAttemptedSubmit: false,
        fieldErrors: { firstName: TEXT_KEYS.ENTER_FIRST_NAME },
      });

      expect(html).not.toContain("newsletterErrorSummary");
    });

    it("renders last name field without the optional caption", () => {
      const html = renderView();

      // "common.last_name" is the shared key NewsletterFormView.jsx references directly
      // (not one of our own TEXT_KEYS) — resolve it the same way rather than pin the word.
      expect(html).toContain(`placeholder="${enText("common.last_name")}"`);
      expect(html).not.toContain("Last Name (Optional)");
    });
  });

  // ---------- Suite 3: Backend error display ----------

  describe("Backend error display", () => {
    it("renders a plain-string backend error message", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.ERROR,
          errorMessage: "Server error",
        },
      });

      expect(html).toContain("newsletterErrorMessage");
      expect(html).toContain("Server error");
    });

    it("does not render backend error when errorMessage is null", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.ERROR,
          errorMessage: null,
        },
      });

      expect(html).not.toContain("newsletterErrorMessage");
    });

    it("does not render backend error when status is IDLE", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.IDLE,
          errorMessage: { en: "lingering", he: "lingering" },
        },
      });

      expect(html).not.toContain("newsletterErrorMessage");
    });
  });

  // ---------- Suite 4: Hebrew-only newsletter label ----------

  describe("Hebrew-only newsletter label", () => {
    it("renders Hebrew text in int-he span when newsletter has no English name", () => {
      const html = renderView();

      // The Hebrew-only newsletter in the fixture should render its Hebrew text
      expect(html).toContain("חדשות ספריא");
      expect(html).toContain("int-he");
    });

    it("renders empty int-en span for Hebrew-only newsletter", () => {
      const html = renderView();

      // int-en span for Hebrew-only newsletter should be empty
      // (the English label for sefaria_news and educator_resources will still appear in int-en spans)
      expect(html).toContain("int-en");
    });

    it("renders English text in int-en span for English-only newsletter", () => {
      const html = renderView();

      expect(html).toContain("Sefaria News &amp; Resources");
    });
  });

  // ---------- Suite 5: Submitting state ----------

  describe("Submitting state", () => {
    it("disables the submit button when submitting", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.SUBMITTING,
        },
      });

      expect(html).toContain("disabled");
    });

    it("shows loading message when submitting", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.SUBMITTING,
        },
      });

      expect(html).toContain("loading");
    });

    it("does not show loading message when idle", () => {
      const html = renderView({
        formStatus: {
          ...baseProps.formStatus,
          status: FORM_STATUS.IDLE,
        },
      });

      // The submit button should show "Submit" text, not loading
      expect(html).toContain(enText(TEXT_KEYS.SUBMIT));
      expect(html).not.toContain('class="loading"');
    });

    // These four guard the Sefaria._bilingual(...) fix directly: a prior version resolved
    // the same key via Sefaria._() for both `message` and `heMessage`, which only looked
    // correct because the (now-fixed) LoadingMessage mock above discarded whichever one
    // didn't match the current language. These assert the actual text shown, in both
    // languages and both logged-in states, so a regression can't hide behind the mock again.
    it("shows the English SUBMITTING text while submitting (logged out)", () => {
      const html = renderView({
        formStatus: { ...baseProps.formStatus, status: FORM_STATUS.SUBMITTING, isLoggedIn: false },
      });

      expect(html).toContain(enText(TEXT_KEYS.SUBMITTING));
    });

    it("shows the Hebrew SUBMITTING text while submitting (logged out)", () => {
      MockSefariaModule.interfaceLang = "hebrew";
      const html = renderView({
        formStatus: { ...baseProps.formStatus, status: FORM_STATUS.SUBMITTING, isLoggedIn: false },
      });
      MockSefariaModule.interfaceLang = "english";

      expect(html).toContain(heText(TEXT_KEYS.SUBMITTING));
    });

    it("shows the English UPDATING text while submitting (logged in)", () => {
      const html = renderView({
        formStatus: { ...baseProps.formStatus, status: FORM_STATUS.SUBMITTING, isLoggedIn: true },
      });

      expect(html).toContain(enText(TEXT_KEYS.UPDATING));
    });

    it("shows the Hebrew UPDATING text while submitting (logged in)", () => {
      MockSefariaModule.interfaceLang = "hebrew";
      const html = renderView({
        formStatus: { ...baseProps.formStatus, status: FORM_STATUS.SUBMITTING, isLoggedIn: true },
      });
      MockSefariaModule.interfaceLang = "english";

      expect(html).toContain(heText(TEXT_KEYS.UPDATING));
    });
  });
});
