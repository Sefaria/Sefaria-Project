/* Testing done using Jest */
// With the assistant on, a null tab has no button of its own: its body points to the
// Library Assistant, and the floating Ask button becomes "✦ Search with Library Assistant",
// asking about the search. With it off, each tab shows its browse button, as before.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  interfaceLang: "english",
} }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import NoSearchResults from "../NoSearchResults";

// The real widget defines <lc-chatbot> when its script loads (this jsdom has no customElements)
const widgetLoaded = () => {
  window.customElements = { get: () => class {}, whenDefined: () => Promise.resolve() };
};

describe("NoSearchResults", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    document.body.appendChild(document.createElement("lc-chatbot"));
    widgetLoaded();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    document.querySelector("lc-chatbot")?.remove();
  });

  const render = (mode) => act(() => {
    ReactDOM.render(<NoSearchResults mode={mode} query="minkeee" />, container);
  });
  const ctas = () => container.querySelectorAll(".noSearchResults-cta");
  const body = () => container.querySelector(".noSearchResults-body").textContent;

  describe("with the assistant on", () => {
    it.each(["sources", "books", "authors", "topics"])("shows no button and the assistant body on %s", function (mode) {
      render(mode);
      expect(ctas()).toHaveLength(0);
      expect(body()).toBe(`search.null.${mode}.body.library_assistant`);
    });

    it("turns the floating Ask button into the search action, asking about the query", function () {
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources");
      document.removeEventListener("chatbot:launcher", launcher);
      const detail = launcher.mock.calls[launcher.mock.calls.length - 1][0].detail;
      expect(detail).toEqual({source: "search_no_results", question: "search.null.library_assistant_question"});
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

  describe("when the widget's script fails to load", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      window.customElements = { get: () => undefined, whenDefined: () => new Promise(() => {}) };
    });
    afterEach(() => { jest.useRealTimers(); });

    it("shows neither version while it may still load, then the browse button", async function () {
      render("sources");
      expect(ctas()).toHaveLength(0);
      expect(container.querySelector(".noSearchResults-body").style.visibility).toBe("hidden");
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(ctas()).toHaveLength(1);
      expect(body()).toBe("search.null.sources.body");
    });
  });

  describe("with the assistant off", () => {
    beforeEach(() => { document.querySelector("lc-chatbot").remove(); });

    it.each([["sources", "/texts"], ["books", "/texts"], ["authors", "/people"], ["topics", "/topics"]])(
      "shows the %s browse button and the tab's own body", function (mode, href) {
      render(mode);
      expect(ctas()).toHaveLength(1);
      expect(ctas()[0].getAttribute("href")).toBe(href);
      expect(body()).toBe(`search.null.${mode}.body`);
    });

    it("leaves the floating button alone", function () {
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources");
      document.removeEventListener("chatbot:launcher", launcher);
      expect(launcher).not.toHaveBeenCalled();
    });
  });
});
