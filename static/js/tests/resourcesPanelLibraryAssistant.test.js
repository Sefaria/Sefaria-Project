/* Testing done using Jest */
// POC (la-sandbox): "✦ Ask Library Assistant" heads the resources panel when the assistant
// widget is on the page, and opens it through the `chatbot:open` document event.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  _v: ({ en }) => en,
  interfaceLang: "english",
  util: { replaceUrlParam: () => null },
} }));

// Every other module ConnectionsPanel imports becomes a stub of no-op components (Misc also
// imports a stylesheet Jest can't parse); the few the tested markup renders pass through.
const mockStubModule = (overrides = {}) => new Proxy(overrides, {
  get: (target, prop) => (prop === "__esModule" ? true : prop in target ? target[prop] : () => null),
});
jest.mock("../Misc", () => mockStubModule({
  InterfaceText: ({ children, text }) => children || text.en,
}));
["../ContentText", "../Media", "../ConnectionFilters", "../SidebarSearch", "../TextList",
 "../ConnectionsPanelHeader", "../AddToSourceSheet", "../LexiconBox", "../AboutBox",
 "../GuideBox", "../TranslationsBox", "../LinkerAdminBox", "../ExtendedNotes", "../BookPage",
 "../CollectionsWidget", "../TopicSearch", "../WebPage", "../sefaria/sefariaJquery",
].forEach((path) => jest.mock(path, () => mockStubModule()));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";

const { LibraryAssistantToolsButton } = require("../ConnectionsPanel");
require("../sefaria/util").default.setupPrototypes(); // ToolsButton uses String#camelize

describe("Resources panel Library Assistant item", function () {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    global.gtag = jest.fn();
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
    document.querySelector("lc-chatbot")?.remove();
  });

  const render = () => act(() => { ReactDOM.render(<LibraryAssistantToolsButton />, container); });
  const item = () => container.querySelector(".toolsButton.askLibraryAssistant");

  it("is absent unless the assistant is on the page", function () {
    render();
    expect(item()).toBeNull();
  });

  it("shows ✦ Ask Library Assistant and opens the widget", function () {
    document.body.appendChild(document.createElement("lc-chatbot"));
    render();
    expect(item().textContent).toBe("✦Ask Library Assistant");

    const listener = jest.fn();
    document.addEventListener("chatbot:open", listener);
    act(() => { item().click(); });
    document.removeEventListener("chatbot:open", listener);
    expect(listener.mock.calls[0][0].detail).toEqual({ source: "resources_panel" });
  });
});
