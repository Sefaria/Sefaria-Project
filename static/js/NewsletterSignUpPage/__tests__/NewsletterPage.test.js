/**
 * Jest Unit Tests: NewsletterPage — Static page integration
 *
 * Tests the page-level stage observer that hides supplemental marketing
 * content while keeping the persistent footer visible.
 *
 * Strategy: mock NewsletterSignUpPageForm and drive onStageChange directly.
 */

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { STAGE } from "../stateSymbols";

// ============================================================================
// Mocks — must be declared before the component import
// ============================================================================

jest.mock("../../sefaria/sefaria", () => ({
  interfaceLang: "english",
  _: (text) => text,
  site: false,
}));

const Sefaria = require("../../sefaria/sefaria");

jest.mock("../../Misc", () => {
  const React = require("react");

  const SimpleInterfaceBlock = ({ en, he }) => (
    <>
      <span className="int-en">{en}</span>
      <span className="int-he">{he}</span>
    </>
  );

  return {
    SimpleInterfaceBlock,
    InterfaceText: ({ text, children }) => {
      if (text) {
        return (
          <>
            <span className="int-en">{text.en || text}</span>
            <span className="int-he">{text.he || ""}</span>
          </>
        );
      }
      return <span className="int-en">{children}</span>;
    },
    HebrewText: ({ children }) => <>{children}</>,
    EnglishText: ({ children }) => <>{children}</>,
    ResponsiveNBox: ({ content }) => (
      <div>{content.map((child, index) => React.cloneElement(child, { key: index }))}</div>
    ),
    TwoOrThreeBox: ({ children }) => <div>{children}</div>,
    NBox: ({ children }) => <div>{children}</div>,
    LoadingMessage: () => null,
    LoadingRing: () => null,
    OnInView: ({ children }) => <>{children}</>,
    handleAnalyticsOnMarkdown: jest.fn(),
  };
});

jest.mock("../../NewsletterSignUpForm", () => ({
  NewsletterSignUpForm: () => null,
}));

jest.mock("../../NewsletterSignUpPage/NewsletterSignUpPageForm", () => {
  const React = require("react");
  const { STAGE } = require("../stateSymbols");

  return {
    __esModule: true,
    default: function MockNewsletterSignUpPageForm({ onStageChange }) {
      return (
        <div data-testid="newsletter-form">
          <button type="button" data-testid="set-confirmation" onClick={() => onStageChange(STAGE.CONFIRMATION)}>
            confirmation
          </button>
          <button type="button" data-testid="set-success" onClick={() => onStageChange(STAGE.SUCCESS)}>
            success
          </button>
        </div>
      );
    },
  };
});

// --- Import the component under test AFTER all mocks ---
const { NewsletterPage } = require("../../StaticPages");

// ============================================================================
// Helpers
// ============================================================================

let container;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  Sefaria.interfaceLang = "english";
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  document.body.removeChild(container);
  container = null;
});

const renderPage = () => {
  act(() => {
    ReactDOM.render(<NewsletterPage />, container);
  });
};

const clickByTestId = (testId) => {
  act(() => {
    container.querySelector(`[data-testid="${testId}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const pageText = () => container.textContent;

const expectSupplementalContentVisible = () => {
  expect(pageText()).toContain("Weekly Parashah Study Companion");
  expect(pageText()).toContain("Timeless Topics");
  expect(pageText()).toContain("What people are saying about our emails...");
};

const expectSupplementalContentHidden = () => {
  expect(pageText()).not.toContain("Weekly Parashah Study Companion");
  expect(pageText()).not.toContain("Timeless Topics");
  expect(pageText()).not.toContain("What people are saying about our emails...");
};

const expectHeaderVisible = () => {
  expect(pageText()).toContain("Stay Connected");
};

// ============================================================================
// Test Suites
// ============================================================================

describe("NewsletterPage", () => {
  it("shows supplemental content and header on initial render", () => {
    renderPage();

    expectSupplementalContentVisible();
    expectHeaderVisible();
  });

  it("hides supplemental content and keeps header visible on confirmation stage", () => {
    renderPage();

    clickByTestId("set-confirmation");

    expectSupplementalContentHidden();
    expectHeaderVisible();
  });

  it("keeps supplemental content hidden and header visible on success stage", () => {
    renderPage();

    clickByTestId("set-success");

    expectSupplementalContentHidden();
    expectHeaderVisible();
  });

  it("does not render email examples in Hebrew but keeps testimonials and header visible", () => {
    Sefaria.interfaceLang = "hebrew";

    renderPage();

    expect(pageText()).not.toContain("Learn about our weekly study emails...");
    expect(pageText()).not.toContain("Weekly Parashah Study Companion");
    expect(pageText()).not.toContain("Timeless Topics");
    expect(pageText()).toContain("מה אנשים אומרים על המיילים שלנו...");
    expectHeaderVisible();
  });
});
