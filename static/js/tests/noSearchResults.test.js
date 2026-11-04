/* Testing done using Jest */
// With the assistant on, a no-results tab has no button of its own: its body points to the
// Library Assistant, and the floating Ask button becomes "✦ Search with Library Assistant",
// asking about the search. With it off, each tab shows its browse button, as before.
const mockStrings = {
  "header.library_assistant": "Library Assistant",
  "search.no_results.sources.h1": "No sources found for “{query}”",
  "search.no_results.sources.body.library_assistant": "Try a different search term, browse the Library or {br}ask the {assistant} for help.",
  "search.no_results.library_assistant_question": "I searched for \"{query}\" and got no results.",
};
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => mockStrings[k] ?? k,
  interfaceLang: "english",
} }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import NoSearchResults from "../NoSearchResults";
import { LibraryAssistantContext } from "../context";

// The real widget defines <lc-chatbot> when its script loads (this jsdom has no customElements)
const widgetLoaded = () => {
  window.customElements = { get: () => class {}, whenDefined: () => Promise.resolve() };
};

describe("NoSearchResults", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    widgetLoaded();
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  // `onPage`: whether ReaderApp put the widget on the page
  const render = (mode, { onPage = true, query = "minkeee" } = {}) => act(() => {
    ReactDOM.render(
      <LibraryAssistantContext.Provider value={onPage}>
        <NoSearchResults mode={mode} query={query} />
      </LibraryAssistantContext.Provider>,
      container,
    );
  });
  const ctas = () => container.querySelectorAll(".noSearchResults-cta");
  const bodyElement = () => container.querySelector(".noSearchResults-body");
  const body = () => bodyElement().textContent;
  const isPending = () => container.querySelector(".noSearchResults").classList.contains("noSearchResults--pending");
  const lastDetail = (listener) => listener.mock.calls[listener.mock.calls.length - 1][0].detail;

  it("puts the search in the heading as typed, even with $& in it", function () {
    render("sources", { query: "a$&b" });
    expect(container.querySelector(".noSearchResults-heading").textContent).toBe("No sources found for “a$&b”");
  });

  describe("with the assistant on", () => {
    it.each(["books", "authors", "topics"])("shows no button and the assistant body on %s", function (mode) {
      render(mode);
      expect(ctas()).toHaveLength(0);
      expect(body()).toBe(`search.no_results.${mode}.body.library_assistant`);
      expect(isPending()).toBe(false);
    });

    it("links the assistant's name and breaks the line where the translation says", function () {
      render("sources");
      expect(ctas()).toHaveLength(0);
      expect(body()).toBe("Try a different search term, browse the Library or ask the Library Assistant for help.");
      const link = bodyElement().querySelector("a.noSearchResults-assistantLink");
      expect(link.textContent).toBe("Library Assistant");
      expect(bodyElement().innerHTML).toContain("browse the Library or <br>ask the ");
    });

    it("asks the assistant about the search when its name is clicked", function () {
      render("sources");
      const open = jest.fn();
      document.addEventListener("chatbot:open", open);
      act(() => { bodyElement().querySelector("a").click(); });
      document.removeEventListener("chatbot:open", open);
      expect(lastDetail(open)).toEqual({source: "search_no_results", question: "I searched for \"minkeee\" and got no results."});
    });

    it("turns the floating Ask button into the search action, asking about the query as typed", function () {
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources", { query: "$&" });
      document.removeEventListener("chatbot:launcher", launcher);
      expect(lastDetail(launcher)).toEqual({source: "search_no_results", question: "I searched for \"$&\" and got no results."});
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
      render("books");
      expect(ctas()).toHaveLength(0);
      expect(isPending()).toBe(true);
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect(ctas()).toHaveLength(1);
      expect(isPending()).toBe(false);
      expect(body()).toBe("search.no_results.books.body");
    });

    it("stops waiting when the page goes away", function () {
      render("books");
      expect(jest.getTimerCount()).toBe(1);
      act(() => { ReactDOM.unmountComponentAtNode(container); });
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe("with the assistant off", () => {
    it.each([["sources", "/texts"], ["books", "/texts"], ["authors", "/people"], ["topics", "/topics"]])(
      "shows the %s browse button and the tab's own body", function (mode, href) {
      render(mode, { onPage: false });
      expect(ctas()).toHaveLength(1);
      expect(ctas()[0].getAttribute("href")).toBe(href);
      expect(body()).toBe(`search.no_results.${mode}.body`);
    });

    it("leaves the floating button alone", function () {
      const launcher = jest.fn();
      document.addEventListener("chatbot:launcher", launcher);
      render("sources", { onPage: false });
      document.removeEventListener("chatbot:launcher", launcher);
      expect(launcher).not.toHaveBeenCalled();
    });

    it("offers the assistant once ReaderApp puts it on the page (e.g. after logging in)", function () {
      render("sources", { onPage: false });
      expect(ctas()).toHaveLength(1);
      render("sources", { onPage: true });
      expect(ctas()).toHaveLength(0);
      expect(bodyElement().querySelector("a.noSearchResults-assistantLink")).not.toBeNull();
    });
  });
});
