/* Testing done using Jest */
// The Sources null page offers "✦ Try Library Assistant" next to Browse Library; it opens
// ReaderApp's Library Assistant modal by dispatching a document event.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  interfaceLang: "english",
} }));
jest.mock("../Misc", () => ({ InterfaceText: ({ children }) => children }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import NoSearchResults, { OPEN_LIBRARY_ASSISTANT_EVENT } from "../NoSearchResults";

describe("NoSearchResults", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });
  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
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
    expect(assistantButton().textContent).toBe("✦ search.null.sources.assistant_button");
  });

  it("asks ReaderApp to open the modal when clicked", function () {
    render("sources");
    const listener = jest.fn();
    document.addEventListener(OPEN_LIBRARY_ASSISTANT_EVENT, listener);
    act(() => { assistantButton().click(); });
    document.removeEventListener(OPEN_LIBRARY_ASSISTANT_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each(["books", "authors", "topics"])("does not show it on the %s null page", function (mode) {
    render(mode);
    expect(assistantButton()).toBeNull();
  });
});
