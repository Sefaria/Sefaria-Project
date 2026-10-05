/* Testing done using Jest */
// The Library Assistant promo moved from a site-wide banner into a dialog opened from
// the header. These tests pin that it still reports the same analytics and writes the
// same "Maybe later" backoff state the banner did.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  _uid: null,
  util: { getCookieDomain: () => "", currentPath: () => "/Genesis.1?lang=bi" },
  editProfileAPI: jest.fn(() => Promise.resolve()),
} }));
jest.mock("../sefaria/sefariaJquery", () => ({ __esModule: true, default: { cookie: jest.fn() } }));

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import mockSefaria from "../sefaria/sefaria";
import { LibraryAssistantModal, getLibraryAssistantLoginHref } from "../LibraryAssistantModal";

const GTAG_PARAMS = { campaignID: "LA Stand Alone Promo", project: "Library Assistant" };

describe("LibraryAssistantModal", function () {
  let container;
  let onClose;

  beforeAll(() => {
    // jsdom does not implement the <dialog> modal API.
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
    sessionStorage.clear();
    global.gtag = jest.fn();
    onClose = jest.fn();
    mockSefaria._uid = null;
    mockSefaria.editProfileAPI.mockClear();
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  const render = () => act(() => {
    ReactDOM.render(<LibraryAssistantModal onClose={onClose} />, container);
  });
  const click = (selector) => act(() => {
    container.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const clickedEvents = () => global.gtag.mock.calls.filter(([, name]) => name === "promo_clicked");

  it("renders the banner copy and icon inside a dialog", function () {
    render();
    expect(container.querySelector("dialog.dialogModal")).not.toBeNull();
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(container.querySelector("img").getAttribute("src")).toBe("/static/icons/ai-double-star.svg");
    expect(container.textContent).toContain("site_wide_banner.ask_the_library_assistant");
    expect(container.textContent).toContain("site_wide_banner.discover_answers_to_your_questions");
  });

  it("fires promo_viewed once per session, deduped on the same key as the banner", function () {
    render();
    expect(global.gtag).toHaveBeenCalledWith("event", "promo_viewed", GTAG_PARAMS);
    expect(sessionStorage.getItem("promo_viewed_signup_promo_banner_dismissed")).toBe("1");
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    global.gtag.mockClear();
    render();
    expect(global.gtag).not.toHaveBeenCalledWith("event", "promo_viewed", expect.anything());
  });

  it("logged out: links to login via /enable-library-assistant and tracks 'login'", function () {
    render();
    const link = container.querySelector("a.logInToTry");
    const expectedHref = "/login?next=" + encodeURIComponent(
      "/enable-library-assistant?next=" + encodeURIComponent("/Genesis.1?lang=bi")
    );
    expect(link.getAttribute("href")).toBe(expectedHref);
    expect(getLibraryAssistantLoginHref("/Genesis.1?lang=bi")).toBe(expectedHref);
    link.addEventListener("click", (e) => e.preventDefault()); // keep jsdom from navigating
    click("a.logInToTry");
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "login" }]]);
    expect(onClose).toHaveBeenCalled();
  });

  it("logged in: 'Try It' tracks 'join' and enables the assistant", function () {
    mockSefaria._uid = 42;
    render();
    expect(container.querySelector("a.logInToTry")).toBeNull();
    expect(global.gtag).toHaveBeenCalledWith("event", "promo_viewed", GTAG_PARAMS);
    expect(sessionStorage.getItem("promo_viewed_chatbot_experiment_banner_dismissed")).toBe("1");
    click(".libraryAssistantModalPrimary");
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "join" }]]);
    expect(mockSefaria.editProfileAPI).toHaveBeenCalledWith({ settings: { library_assistant: true } });
    expect(container.querySelector(".libraryAssistantModalPrimary").disabled).toBe(true);
    expect(container.querySelector(".libraryAssistantModalPrimary").textContent).toBe("common.loading");
  });

  it("'Maybe later' writes the banner's backoff state, tracks it, and closes", function () {
    render();
    // Opening the modal advances the promo session counter just as the banner's mount did.
    expect(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_session_counter")).toBe("1");
    click(".libraryAssistantModalMaybeLater");
    const state = JSON.parse(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_state"));
    expect(state).toEqual({
      maybeLaterCount: 1,
      lastDismissalTime: expect.any(Number),
      sessionCountAtLastDismissal: 1,
      dismissedForever: false,
    });
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "maybe_later" }]]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens regardless of backoff and caps 'Maybe later' like the banner", function () {
    localStorage.setItem("promo_backoff_signup_promo_banner_dismissed_state", JSON.stringify({
      maybeLaterCount: 2, lastDismissalTime: 0, sessionCountAtLastDismissal: 0, dismissedForever: false,
    }));
    render();
    expect(container.querySelector(".libraryAssistantModal")).not.toBeNull();
    click(".libraryAssistantModalMaybeLater");
    const state = JSON.parse(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_state"));
    expect(state.maybeLaterCount).toBe(3);
    expect(state.dismissedForever).toBe(true);
  });

  it.each([
    ["the × button", () => click(".libraryAssistantModalClose")],
    ["Escape", () => act(() => {
      container.querySelector("dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    })],
    ["a backdrop click", () => click("dialog")],
  ])("closing via %s tracks 'close' and writes no dismissal state", function (_, doClose) {
    render();
    doClose();
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "close" }]]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_state")).toBeNull();
  });
});
