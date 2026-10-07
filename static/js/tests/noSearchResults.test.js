/* Testing done using Jest */
// Every null page (sources, books, authors, topics) offers "✦ Try Library Assistant" in place of its browse button when the
// assistant widget is on the page; it opens the widget with a request built from the query.
let mockBreakpoint = "desktop";
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  interfaceLang: "english",
  breakpoints: { MOBILE: "mobile" },
  getBreakpoint: () => mockBreakpoint,
} }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import NoSearchResults from "../NoSearchResults";

describe("NoSearchResults", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.body.appendChild(document.createElement("lc-chatbot"));
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    document.querySelector("lc-chatbot")?.remove();
  });

  const render = (mode) => act(() => {
    ReactDOM.render(<NoSearchResults mode={mode} query="minkeee" />, container);
  });
  const assistantButton = () => container.querySelector(".noSearchResults-cta--assistant");

  it("shows the Library Assistant button instead of Browse Library on the Sources null page", function () {
    render("sources");
    const ctas = container.querySelectorAll(".noSearchResults-ctas .noSearchResults-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toBe(assistantButton());
    expect(assistantButton().textContent).toBe("search.null.button.library_assistant");
  });

  it("opens the assistant with a request for the query when clicked", function () {
    render("sources");
    const listener = jest.fn();
    document.addEventListener("chatbot:open", listener);
    act(() => { assistantButton().click(); });
    document.removeEventListener("chatbot:open", listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      source: "search_no_results",
      question: 'I searched for "minkeee" on Sefaria and got no results. Can you help me find relevant sources, books, authors and/or topics?',
    });
  });

  it.each([["sources", "/texts"], ["books", "/texts"], ["authors", "/people"], ["topics", "/topics"]])(
    "shows the %s browse button instead when the assistant is off", function (mode, href) {
    document.querySelector("lc-chatbot").remove();
    render(mode);
    expect(assistantButton()).toBeNull();
    const ctas = container.querySelectorAll(".noSearchResults-ctas .noSearchResults-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0].getAttribute("href")).toBe(href);
  });

  it.each(["books", "authors", "topics"])("shows it on the %s null page too, sending the same request", function (mode) {
    render(mode);
    const ctas = container.querySelectorAll(".noSearchResults-ctas .noSearchResults-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toBe(assistantButton());
    const listener = jest.fn();
    document.addEventListener("chatbot:open", listener);
    act(() => { assistantButton().click(); });
    document.removeEventListener("chatbot:open", listener);
    expect(listener.mock.calls[0][0].detail.source).toBe("search_no_results");
    expect(listener.mock.calls[0][0].detail.question).toContain('"minkeee"');
  });

  it.each(["sources", "books", "authors", "topics"])("uses the assistant body on %s when the assistant is on, the tab's own when off", function (mode) {
    render(mode);
    expect(container.querySelector(".noSearchResults-body").textContent).toBe("search.null.body.library_assistant");
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    document.querySelector("lc-chatbot").remove();
    render(mode);
    expect(container.querySelector(".noSearchResults-body").textContent).toBe(`search.null.${mode}.body`);
  });

  describe("on phones (prototype)", () => {
    beforeEach(() => { mockBreakpoint = "mobile"; });
    afterEach(() => { mockBreakpoint = "desktop"; });

    it("keeps the browse button and turns the floating Ask button into the search action", function () {
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources");
      document.removeEventListener("chatbot:launcher", launcher);
      expect(assistantButton()).toBeNull();
      const ctas = container.querySelectorAll(".noSearchResults-ctas .noSearchResults-cta");
      expect(ctas).toHaveLength(1);
      expect(ctas[0].getAttribute("href")).toBe("/texts");
      const detail = launcher.mock.calls[launcher.mock.calls.length - 1][0].detail;
      expect(detail.label).toBe("search.null.launcher.library_assistant");
      expect(detail.source).toBe("search_no_results");
      expect(detail.question).toContain('"minkeee"');
    });

    it.each([["callout", "above"], ["side", "side"]])("with ?la_null_prototype=%s keeps Ask and shows the hint box (%s)", function (variant, position) {
      window.history.replaceState({}, "", "/search?q=minkeee&la_null_prototype=" + variant);
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources");
      document.removeEventListener("chatbot:launcher", launcher);
      const detail = launcher.mock.calls[launcher.mock.calls.length - 1][0].detail;
      expect(detail.label).toBeUndefined();
      expect(detail.callout).toBe("search.null.launcher.callout");
      expect(detail.calloutPosition).toBe(position);
      window.history.replaceState({}, "", "/");
      localStorage.removeItem("la_null_prototype");
    });

    it("puts the Ask button back when the page goes away", function () {
      render("sources");
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      act(() => { ReactDOM.unmountComponentAtNode(container); });
      document.removeEventListener("chatbot:launcher", launcher);
      expect(launcher.mock.calls[0][0].detail).toBeNull();
    });
  });
});
