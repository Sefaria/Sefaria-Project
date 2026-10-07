/* Testing done using Jest */
// The Sources null page offers "✦ Try Library Assistant" next to Browse Library when the
// assistant widget is on the page; it opens the widget with a request built from the query.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  interfaceLang: "english",
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

  it("shows the Library Assistant CTA after Browse Library on the Sources null page", function () {
    render("sources");
    const ctas = container.querySelectorAll(".noSearchResults-ctas .noSearchResults-cta");
    expect(ctas).toHaveLength(2);
    expect(ctas[0].getAttribute("href")).toBe("/texts");
    expect(ctas[1]).toBe(assistantButton());
    expect(assistantButton().textContent).toBe("✦ search.null.button.library_assistant");
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

  it("is absent when the assistant isn't on the page", function () {
    document.querySelector("lc-chatbot").remove();
    render("sources");
    expect(assistantButton()).toBeNull();
  });

  it.each(["books", "authors", "topics"])("does not show it on the %s null page", function (mode) {
    render(mode);
    expect(assistantButton()).toBeNull();
  });
});
