/* Testing done using Jest */
// "✦ Try Assistant" entry points beyond the desktop header item: the first item in the
// mobile hamburger menu and the first entry in the resources panel. Like the header item
// they show to logged-out library visitors only, and open ReaderApp's Library Assistant modal.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  _v: ({ en }) => en,
  _uid: null,
  LIBRARY_MODULE: "library",
  VOICES_MODULE: "voices",
  activeModule: "library",
  interfaceLang: "english",
  breakpoints: { MOBILE: "mobile", DESKTOP: "desktop" },
  getBreakpoint: () => "mobile",
  getLogoutUrl: () => "/logout",
  _siteSettings: { TORAH_SPECIFIC: true, HELP_CENTER_URLS: { HE: "", EN_US: "" } },
  util: { replaceUrlParam: () => null },
} }));

// Every other module the two components import becomes a stub of no-op components (Misc
// also imports a stylesheet Jest can't parse); the few the tested markup renders pass through.
const mockStubModule = (overrides = {}) => new Proxy(overrides, {
  get: (target, prop) => (prop === "__esModule" ? true : prop in target ? target[prop] : () => null),
});
jest.mock("../Misc", () => mockStubModule({
  InterfaceText: ({ children, text }) => children || text.en,
  DonateLink: ({ children }) => children,
  useOnceFullyVisible: () => null,
}));
["../ContentText", "../Media", "../ConnectionFilters", "../SidebarSearch", "../TextList",
 "../ConnectionsPanelHeader", "../AddToSourceSheet", "../LexiconBox", "../AboutBox",
 "../GuideBox", "../TranslationsBox", "../LinkerAdminBox", "../ExtendedNotes", "../BookPage",
 "../CollectionsWidget", "../TopicSearch", "../WebPage", "../ProfilePic", "../HeaderAutocomplete",
 "../common/DropdownMenu", "../common/Button", "../sefaria/sefariaJquery",
].forEach((path) => jest.mock(path, () => mockStubModule()));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import mockSefaria from "../sefaria/sefaria";
import { OPEN_LIBRARY_ASSISTANT_EVENT } from "../LibraryAssistantModal";

const { Header } = require("../Header");
const { LibraryAssistantToolsButton } = require("../ConnectionsPanel");
require("../sefaria/util").default.setupPrototypes(); // ToolsButton uses String#camelize

describe("Library Assistant entry points", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    global.gtag = jest.fn();
    mockSefaria._uid = null;
    mockSefaria.activeModule = "library";
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  const click = (el) => act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  describe("mobile hamburger menu", function () {
    let onAssistantClick, closeMenu;
    beforeEach(() => {
      onAssistantClick = jest.fn();
      closeMenu = jest.fn();
    });
    const render = (module = "library") => act(() => {
      ReactDOM.render(
        <Header multiPanel={false} headerMode={false} onRefClick={() => {}} showSearch={() => {}}
                openTopic={() => {}} openURL={() => {}} module={module} mobileNavMenuOpen={true}
                onMobileMenuButtonClick={closeMenu} onAssistantClick={onAssistantClick} />,
        container);
    });
    const assistantItem = () => container.querySelector(".mobileNavMenu a.assistant");

    it("shows ✦ Try Assistant as the first menu item to logged-out library visitors", function () {
      render();
      const firstItem = container.querySelector(".mobileNavMenu > a");
      expect(firstItem).toBe(assistantItem());
      expect(firstItem.textContent).toBe("✦header.try_assistant");
      expect(firstItem.nextElementSibling.getAttribute("href")).toBe("/texts");
    });

    it("closes the menu and opens the modal when tapped", function () {
      render();
      click(assistantItem());
      expect(closeMenu).toHaveBeenCalledTimes(1);
      expect(onAssistantClick).toHaveBeenCalledTimes(1);
    });

    it("is hidden once signed in", function () {
      mockSefaria._uid = 42;
      render();
      expect(container.querySelector(".mobileNavMenu")).not.toBeNull();
      expect(assistantItem()).toBeNull();
    });

    it("is hidden outside the library module", function () {
      render("voices");
      expect(assistantItem()).toBeNull();
    });
  });

  describe("resources panel", function () {
    const render = () => act(() => { ReactDOM.render(<LibraryAssistantToolsButton />, container); });
    const assistantButton = () => container.querySelector(".toolsButton.tryAssistant");

    it("shows a ✦ Try Assistant tools button to logged-out library visitors", function () {
      render();
      expect(assistantButton()).not.toBeNull();
      expect(assistantButton().querySelector(".toolsButtonGlyph").textContent).toBe("✦");
      expect(assistantButton().querySelector(".toolsButtonText").textContent).toBe("Try Assistant");
    });

    it("asks ReaderApp to open the modal when clicked", function () {
      render();
      const listener = jest.fn();
      document.addEventListener(OPEN_LIBRARY_ASSISTANT_EVENT, listener);
      click(assistantButton());
      document.removeEventListener(OPEN_LIBRARY_ASSISTANT_EVENT, listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("is hidden once signed in", function () {
      mockSefaria._uid = 42;
      render();
      expect(assistantButton()).toBeNull();
    });

    it("is hidden outside the library module", function () {
      mockSefaria.activeModule = "voices";
      render();
      expect(assistantButton()).toBeNull();
    });
  });
});
