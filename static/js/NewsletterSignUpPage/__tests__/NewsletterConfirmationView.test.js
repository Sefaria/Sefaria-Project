/**
 * Jest Unit Tests: NewsletterConfirmationView - Subscription Diff Display
 *
 * Tests the conditional rendering logic that shows subscription diffs
 * for logged-in users vs. the flat "subscribed to" list for logged-out users.
 */

import React from "react";
import ReactDOMServer from "react-dom/server";
import NewsletterConfirmationView from "../NewsletterConfirmationView";
import { FORM_STATUS } from "../stateSymbols";
import { TEXT_KEYS } from "../textKeys";
import MockSefariaModule from "../../sefaria/sefaria";
import { enText, heText, escapeHtml } from "../testSupport/i18nTestUtils";

// Mock Sefaria global object
jest.mock("../../sefaria/sefaria", () => ({
  interfaceLang: "english",
  _: (text) => require("../testSupport/i18nTestUtils").translate(text),
  _keyedString: (id, lang) => require("../testSupport/i18nTestUtils").keyedString(id, lang),
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
  site: false,
}));

// Set up global Sefaria object for components that use it
global.Sefaria = {
  _: (text) => require("../testSupport/i18nTestUtils").translate(text), // resolves keyed strings from en.json
  _bilingual: (id) => require("../testSupport/i18nTestUtils").bilingual(id),
  interfaceLang: "english",
  site: false,
};

// Mock components from Misc
jest.mock("../../Misc", () => ({
  InterfaceText: ({ text, children }) => {
    if (text) {
      return <span className="int-en">{text.en || text}</span>;
    }
    return <span className="int-en">{require("../testSupport/i18nTestUtils").translate(children)}</span>;
  },
  // Picks message or heMessage based on the CURRENT interface language, mirroring the
  // real LoadingMessage+InterfaceText (EnglishText/HebrewText filtering). A mock that
  // always showed `message` could never fail a test that put the wrong value into
  // `heMessage` — see the _bilingual fix in LearningLevelSurvey.jsx/NewsletterFormView.jsx.
  LoadingMessage: ({ message, heMessage }) => {
    const isHebrew = MockSefariaModule.interfaceLang === "hebrew";
    return <span>{(isHebrew ? heMessage : message) || "Loading..."}</span>;
  },
}));

// Mock SelectableOption (used by learning level radio buttons)
jest.mock("../SelectableOption", () => {
  return function MockSelectableOption({ label, value, isSelected }) {
    return (
      <div data-testid={`option-${value}`} className={isSelected ? "selected" : ""}>
        {label}
      </div>
    );
  };
});

// ========== SHARED TEST FIXTURES ==========

const NEWSLETTERS = [
  { key: "sefaria_news", displayName: { en: "Sefaria News & Resources", he: null } },
  { key: "educator_resources", displayName: { en: "Educator Resources", he: null } },
  { key: "parashah_series", displayName: { en: "Weekly Parashah Study Series", he: null } },
];

const LEARNING_LEVELS = [
  {
    value: 1,
    analyticsName: "Newcomer",
    label: "newsletter_sign_up_page.learning_level_1.label",
    description: "newsletter_sign_up_page.learning_level_1.description",
  },
];

const baseProps = {
  email: "test@example.com",
  newsletters: NEWSLETTERS,
  formStatus: { status: FORM_STATUS.SUCCESS, isLoggedIn: false },
  selectedLevel: null,
  learningLevels: LEARNING_LEVELS,
  onLevelSelect: jest.fn(),
  onSave: jest.fn(),
  onSkip: jest.fn(),
};

// Helper to render with specific props and return HTML string
const renderView = (overrides = {}) => {
  return ReactDOMServer.renderToString(<NewsletterConfirmationView {...baseProps} {...overrides} />);
};

// ========== TESTS ==========

describe("NewsletterConfirmationView - Subscription Display", () => {
  describe("Logged-out users (original behavior)", () => {
    it('shows "subscribed to" with all selected newsletter labels', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        subscriptionDiffs: null,
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
      expect(html).toContain("Sefaria News &amp; Resources, Educator Resources");
    });

    it('does not show "unsubscribed from" text', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: null,
      });

      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.UNSUBSCRIBED_FROM)));
    });

    it('does not show "up to date" text', () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: null,
      });

      expect(html).not.toContain(enText(TEXT_KEYS.PREFERENCES_UP_TO_DATE));
    });

    it("hides newsletter display when no labels provided", () => {
      const html = renderView({
        isLoggedIn: false,
        selectedNewsletters: {},
        subscriptionDiffs: null,
      });

      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
    });
  });

  describe("Logged-in users - added newsletters only", () => {
    it('shows "subscribed to" with only the newly added newsletters', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        subscriptionDiffs: {
          added: ["Educator Resources"],
          removed: [],
        },
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
      expect(html).toContain("Educator Resources");
    });

    it('does not show "unsubscribed from" block', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true },
        subscriptionDiffs: {
          added: ["Educator Resources"],
          removed: [],
        },
      });

      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.UNSUBSCRIBED_FROM)));
    });
  });

  describe("Logged-in users - removed newsletters only", () => {
    it('shows "unsubscribed from" with only the removed newsletters', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: {
          added: [],
          removed: ["Educator Resources"],
        },
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.UNSUBSCRIBED_FROM)));
      expect(html).toContain("Educator Resources");
    });

    it('does not show "subscribed to" block', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        subscriptionDiffs: {
          added: [],
          removed: ["Sefaria News & Resources"],
        },
      });

      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
    });
  });

  describe("Logged-in users - added and removed", () => {
    it('shows both "subscribed to" and "unsubscribed from" blocks', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { educator_resources: true },
        subscriptionDiffs: {
          added: ["Educator Resources"],
          removed: ["Sefaria News & Resources"],
        },
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
      expect(html).toContain("Educator Resources");
      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.UNSUBSCRIBED_FROM)));
      expect(html).toContain("Sefaria News &amp; Resources");
    });
  });

  describe("Logged-in users - no changes", () => {
    it('shows "preferences are up to date" when nothing changed', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: false,
      });

      expect(html).toContain(enText(TEXT_KEYS.PREFERENCES_UP_TO_DATE));
    });

    it('does not show "subscribed to" or "unsubscribed from"', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: false,
      });

      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.UNSUBSCRIBED_FROM)));
    });
  });

  describe("Logged-in users - marketing opt-out", () => {
    it("shows opt-out message when marketingOptOut is true", () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.OPTED_OUT_MARKETING)));
    });

    it('does not show "up to date" when marketing opt-out is the only change', () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        subscriptionDiffs: {
          added: [],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).not.toContain(enText(TEXT_KEYS.PREFERENCES_UP_TO_DATE));
    });

    it("suppresses subscription diffs when opting out (opt-out is the louder, exclusive message)", () => {
      // Functionally, opting out of marketing emails unsubscribes the user from
      // everything — so showing what they "subscribed to" or "unsubscribed from"
      // alongside the opt-out message would be misleading and noisy.
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { educator_resources: true },
        subscriptionDiffs: {
          added: ["Educator Resources"],
          removed: [],
        },
        marketingOptOut: true,
      });

      expect(html).toContain(escapeHtml(enText(TEXT_KEYS.OPTED_OUT_MARKETING)));
      expect(html).not.toContain(escapeHtml(enText(TEXT_KEYS.SUBSCRIBED_TO)));
      expect(html).not.toContain("Educator Resources");
    });
  });

  describe("Hebrew-only newsletter keyToDisplayLabel fallback", () => {
    const NEWSLETTERS_WITH_HEBREW = [
      ...NEWSLETTERS,
      { key: "hebrew_news", displayName: { en: null, he: "חדשות ספריא" } },
    ];

    it("falls back to Hebrew text when interface is English and newsletter has no English name", () => {
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_WITH_HEBREW,
        selectedNewsletters: { hebrew_news: true },
        subscriptionDiffs: null,
      });

      expect(html).toContain("חדשות ספריא");
    });

    it("uses Hebrew text as primary when interface language is Hebrew", () => {
      MockSefariaModule.interfaceLang = "hebrew";
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_WITH_HEBREW,
        selectedNewsletters: { hebrew_news: true },
        subscriptionDiffs: null,
      });
      MockSefariaModule.interfaceLang = "english";

      expect(html).toContain("חדשות ספריא");
    });

    it("falls back to English text when interface is Hebrew but newsletter has no Hebrew name", () => {
      MockSefariaModule.interfaceLang = "hebrew";
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_WITH_HEBREW,
        selectedNewsletters: { sefaria_news: true },
        subscriptionDiffs: null,
      });
      MockSefariaModule.interfaceLang = "english";

      expect(html).toContain("Sefaria News &amp; Resources");
    });
  });

  describe("Multiple newsletters in diff lists", () => {
    it("joins multiple added newsletters with commas", () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: { sefaria_news: true, educator_resources: true, parashah_series: true },
        subscriptionDiffs: {
          added: ["Sefaria News & Resources", "Educator Resources", "Weekly Parashah Study Series"],
          removed: [],
        },
      });

      expect(html).toContain("Sefaria News &amp; Resources, Educator Resources, Weekly Parashah Study Series");
    });

    it("joins multiple removed newsletters with commas", () => {
      const html = renderView({
        isLoggedIn: true,
        selectedNewsletters: {},
        subscriptionDiffs: {
          added: [],
          removed: ["Sefaria News & Resources", "Educator Resources"],
        },
      });

      expect(html).toContain("Sefaria News &amp; Resources, Educator Resources");
    });
  });

  describe("Confirmation email message — follows the primary list, not the first one", () => {
    // ActiveCampaign only emails new subscribers of the general list, which is the list
    // marked primary. It is second here on purpose: the order of the lists isn't promised.
    const NEWSLETTERS_PRIMARY_SECOND = [
      { key: "educator-resources-english", displayName: { en: "Educator Resources", he: null }, primary: false },
      { key: "sefaria-news-resources-english", displayName: { en: "Sefaria News & Resources", he: null }, primary: true },
    ];
    const CONFIRMATION_SENT = escapeHtml("We've sent a confirmation to");
    const SUBMISSION_RECEIVED = escapeHtml("We've received your submission.");

    it("says an email was sent when a logged-out user picks the primary list", () => {
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_PRIMARY_SECOND,
        selectedNewsletters: { "sefaria-news-resources-english": true },
        subscriptionDiffs: null,
      });

      expect(html).toContain(CONFIRMATION_SENT);
      expect(html).not.toContain(SUBMISSION_RECEIVED);
    });

    it("says no email was sent when a logged-out user picks only the first, non-primary list", () => {
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_PRIMARY_SECOND,
        selectedNewsletters: { "educator-resources-english": true },
        subscriptionDiffs: null,
      });

      expect(html).toContain(SUBMISSION_RECEIVED);
      expect(html).not.toContain(CONFIRMATION_SENT);
    });

    it("says an email was sent when a logged-in user adds the primary list", () => {
      const html = renderView({
        isLoggedIn: true,
        newsletters: NEWSLETTERS_PRIMARY_SECOND,
        selectedNewsletters: { "sefaria-news-resources-english": true },
        subscriptionDiffs: { added: ["sefaria-news-resources-english"], removed: [] },
      });

      expect(html).toContain(CONFIRMATION_SENT);
      expect(html).not.toContain(SUBMISSION_RECEIVED);
    });

    it("says no email was sent when a logged-in user adds only the first, non-primary list", () => {
      const html = renderView({
        isLoggedIn: true,
        newsletters: NEWSLETTERS_PRIMARY_SECOND,
        selectedNewsletters: { "educator-resources-english": true },
        subscriptionDiffs: { added: ["educator-resources-english"], removed: [] },
      });

      expect(html).toContain(SUBMISSION_RECEIVED);
      expect(html).not.toContain(CONFIRMATION_SENT);
    });

    it("falls back to the first list when no list is marked primary", () => {
      const html = renderView({
        isLoggedIn: false,
        newsletters: NEWSLETTERS_PRIMARY_SECOND.map((nl) => ({ ...nl, primary: false })),
        selectedNewsletters: { "educator-resources-english": true },
        subscriptionDiffs: null,
      });

      expect(html).toContain(CONFIRMATION_SENT);
      expect(html).not.toContain(SUBMISSION_RECEIVED);
    });
  });

  describe("Embedded learning-level survey — submitting state", () => {
    // isSubmitting is derived internally from formStatus.status, not a direct prop (see
    // NewsletterConfirmationView.jsx). These guard the Sefaria._bilingual(...) fix: a
    // prior version resolved the same key via Sefaria._() for both `message` and
    // `heMessage`, which only looked correct because the (now-fixed) LoadingMessage mock
    // above discarded whichever one didn't match the current language.
    it("shows the English SUBMITTING text while the embedded survey is submitting", () => {
      const html = renderView({
        formStatus: { status: FORM_STATUS.SUBMITTING, isLoggedIn: false },
        selectedNewsletters: {},
        subscriptionDiffs: null,
      });

      expect(html).toContain(enText(TEXT_KEYS.SUBMITTING));
    });

    it("shows the Hebrew SUBMITTING text while the embedded survey is submitting", () => {
      MockSefariaModule.interfaceLang = "hebrew";
      const html = renderView({
        formStatus: { status: FORM_STATUS.SUBMITTING, isLoggedIn: false },
        selectedNewsletters: {},
        subscriptionDiffs: null,
      });
      MockSefariaModule.interfaceLang = "english";

      expect(html).toContain(heText(TEXT_KEYS.SUBMITTING));
    });
  });
});
