/* Testing done using Jest */
// The Library Assistant promo widget in the library homepage sidebar. It carries the old
// banner's copy, analytics and "Maybe later" backoff, in the same markup as a Strapi sidebar ad.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: {
  _: (k) => k,
  _uid: null,
  in_chatbot_experiment: undefined,
  chatbot_promo_maybe_later_json: null,
  breakpoints: { MOBILE: "mobile", TABLET: "tablet", DESKTOP: "desktop" },
  getBreakpoint: jest.fn(() => "desktop"),
  util: { getCookieDomain: () => "", currentPath: () => "/texts" },
  editProfileAPI: jest.fn(() => Promise.resolve()),
} }));
jest.mock("../sefaria/sefariaJquery", () => ({ __esModule: true, default: { cookie: jest.fn() } }));

import React from "react";
import ReactDOM from "react-dom";
import ReactDOMServer from "react-dom/server";
import { act } from "react-dom/test-utils";
import mockSefaria from "../sefaria/sefaria";
import { LibraryAssistantPromo } from "../LibraryAssistantPromo";

const GTAG_PARAMS = { campaignID: "LA Stand Alone Promo", project: "Library Assistant" };
const ANON_STATE_KEY = "promo_backoff_signup_promo_banner_dismissed_state";

describe("LibraryAssistantPromo sidebar widget", function () {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.clear();
    sessionStorage.clear();
    global.gtag = jest.fn();
    mockSefaria._uid = null;
    mockSefaria.interfaceLang = "english";
    mockSefaria.in_chatbot_experiment = undefined;
    mockSefaria.chatbot_promo_maybe_later_json = null;
    mockSefaria.getBreakpoint.mockReturnValue("desktop");
    mockSefaria.editProfileAPI.mockClear();
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  const render = () => act(() => { ReactDOM.render(<LibraryAssistantPromo />, container); });
  const widget = () => container.querySelector(".navSidebarModule > .sidebarPromo.libraryAssistantPromo");
  const click = (selector) => act(() => {
    container.querySelector(selector).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const clickedEvents = () => global.gtag.mock.calls.filter(([, name]) => name === "promo_clicked");
  const viewedEvents = () => global.gtag.mock.calls.filter(([, name]) => name === "promo_viewed");

  it("renders as a standard sidebar promo: ✦ title, banner copy, a button-styled link and a text link", function () {
    render();
    expect(widget()).not.toBeNull();
    expect(widget().querySelector("h3.int-en").textContent).toBe("✦ site_wide_banner.ask_the_library_assistant");
    expect(widget().querySelector("p.int-en").textContent).toBe("site_wide_banner.discover_answers_to_your_questions");
    expect(widget().querySelector("img")).toBeNull();
    expect(widget().querySelector("button")).toBeNull();
    const links = widget().querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[0].className).toBe("button small logInToTry");
    expect(links[1].className).toBe("maybeLater");
  });

  it("uses the Hebrew language class in the Hebrew interface", function () {
    mockSefaria.interfaceLang = "hebrew";
    render();
    expect(widget().querySelector("h3.int-he")).not.toBeNull();
    expect(widget().querySelector("p.int-he")).not.toBeNull();
    mockSefaria.interfaceLang = "english";
  });

  it("renders nothing during SSR", function () {
    expect(ReactDOMServer.renderToString(<LibraryAssistantPromo />)).toBe("");
  });

  it("is hidden for users already in the chatbot experiment, without touching promo state", function () {
    mockSefaria.in_chatbot_experiment = true;
    render();
    expect(container.innerHTML).toBe("");
    expect(viewedEvents()).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("is hidden on mobile, where the assistant does not run", function () {
    mockSefaria.getBreakpoint.mockReturnValue("mobile");
    render();
    expect(widget()).toBeNull();
    expect(viewedEvents()).toEqual([]);
  });

  it("is hidden while the Maybe-later backoff says so, using the remote schedule", function () {
    localStorage.setItem(ANON_STATE_KEY, JSON.stringify({
      maybeLaterCount: 1, lastDismissalTime: Math.floor(Date.now() / 1000), sessionCountAtLastDismissal: 0,
    }));
    render();
    expect(widget()).toBeNull();
    expect(viewedEvents()).toEqual([]);

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    mockSefaria.chatbot_promo_maybe_later_json = { 1: { sessions: 0, days: 0 } };
    render();
    expect(widget()).not.toBeNull();
  });

  it("is hidden for good once dismissed forever", function () {
    localStorage.setItem(ANON_STATE_KEY, JSON.stringify({ maybeLaterCount: 3, dismissedForever: true }));
    render();
    expect(widget()).toBeNull();
  });

  it("fires promo_viewed once per session, deduped on the banner's key", function () {
    render();
    expect(viewedEvents()).toEqual([["event", "promo_viewed", GTAG_PARAMS]]);
    expect(sessionStorage.getItem("promo_viewed_signup_promo_banner_dismissed")).toBe("1");
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    global.gtag.mockClear();
    render();
    expect(viewedEvents()).toEqual([]);
  });

  it("logged out: 'Log in to Try' links to login via /enable-library-assistant and tracks 'login'", function () {
    render();
    const link = container.querySelector("a.logInToTry");
    expect(link.textContent).toBe("site_wide_banner.log_in_to_try");
    expect(link.getAttribute("href")).toBe("/login?next=" + encodeURIComponent(
      "/enable-library-assistant?next=" + encodeURIComponent("/texts")
    ));
    link.addEventListener("click", (e) => e.preventDefault()); // keep jsdom from navigating
    click("a.logInToTry");
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "login" }]]);
  });

  it("logged in: 'Try It' tracks 'join', enables the assistant and shows the pending state", function () {
    mockSefaria._uid = 42;
    render();
    expect(container.querySelector("a.logInToTry")).toBeNull();
    expect(sessionStorage.getItem("promo_viewed_chatbot_experiment_banner_dismissed")).toBe("1");
    const tryIt = container.querySelector("a.tryIt");
    expect(tryIt.className).toBe("button small tryIt");
    expect(tryIt.textContent).toBe("site_wide_banner.try_it");
    click("a.tryIt");
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "join" }]]);
    expect(mockSefaria.editProfileAPI).toHaveBeenCalledWith({ settings: { library_assistant: true } });
    expect(tryIt.textContent).toBe("common.loading");
    expect(tryIt.getAttribute("aria-disabled")).toBe("true");
    click("a.tryIt");
    expect(mockSefaria.editProfileAPI).toHaveBeenCalledTimes(1);
  });

  it("'Maybe later' records the banner's backoff state, tracks it and hides the widget", function () {
    render();
    expect(localStorage.getItem("promo_backoff_signup_promo_banner_dismissed_session_counter")).toBe("1");
    click("a.maybeLater");
    expect(JSON.parse(localStorage.getItem(ANON_STATE_KEY))).toEqual({
      maybeLaterCount: 1,
      lastDismissalTime: expect.any(Number),
      sessionCountAtLastDismissal: 1,
      dismissedForever: false,
    });
    expect(clickedEvents()).toEqual([["event", "promo_clicked", { ...GTAG_PARAMS, feature_name: "maybe_later" }]]);
    expect(widget()).toBeNull();
  });
});
