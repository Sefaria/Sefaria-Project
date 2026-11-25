import React from "react";
import ReactDOMServer from "react-dom/server";
import SuccessView from "../SuccessView";
import { TEXT_KEYS } from "../textKeys";
import { enText, heText, escapeHtml } from "../testSupport/i18nTestUtils";

jest.mock("../../Misc", () => {
  const React = require("react");
  return {
    InterfaceText: ({ children }) => React.createElement("span", null, require("../testSupport/i18nTestUtils").translate(children)),
  };
});

describe("SuccessView", () => {
  let html;
  beforeAll(() => {
    html = ReactDOMServer.renderToString(React.createElement(SuccessView));
  });

  it("renders successView container class", () => {
    expect(html).toContain("successView");
  });

  it("renders ALL_SET heading text", () => {
    expect(html).toContain(enText(TEXT_KEYS.ALL_SET));
  });

  it("TEXT_KEYS.ALL_SET has Hebrew text", () => {
    expect(heText(TEXT_KEYS.ALL_SET)).toBe("הכל מוכן!");
  });

  it("renders THANKS_FOR_JOINING message", () => {
    // escapeHtml accounts for renderToString HTML-encoding the apostrophe as &#x27;,
    // so this can match the full resolved sentence instead of an apostrophe-free substring.
    expect(html).toContain(escapeHtml(enText(TEXT_KEYS.THANKS_FOR_JOINING)));
  });

  it("renders RETURN_TO_SEFARIA link text", () => {
    expect(html).toContain(enText(TEXT_KEYS.RETURN_TO_SEFARIA));
  });

  it("homepage link points to root path", () => {
    expect(html).toContain('href="/"');
  });

  it('success icon img has aria-hidden="true"', () => {
    expect(html).toContain('aria-hidden="true"');
  });

  it("wrapper includes analytics form_name", () => {
    expect(html).toContain("newsletter_signup_complete");
  });
});
