/* Testing done using Jest */
// SiteWideBanner imports the Sefaria singleton; give it a minimal one so Sefaria._ works.
jest.mock("../sefaria/sefaria", () => ({ __esModule: true, default: { _: (k) => k, util: { getCookieDomain: () => "" } } }));
jest.mock("../sefaria/sefariaJquery", () => ({ __esModule: true, default: { cookie: jest.fn() } }));
import { isChatbotBannerExcludedPath } from "../SiteWideBanner";

describe("isChatbotBannerExcludedPath", function () {
  const moduleUrl = new URL("https://www.sefaria.org.il");

  it.each([
    "/login",
    "/login/",
    "/login?next=%2Ftexts",
    "/register",
    "/register/",
    "/register/?next=%2Ftexts#top",
    "/password/reset/confirm/user-id/token/",
    "/password/reset/confirm/user-id/token/?next=%2Ftexts",
  ])("excludes %s", function (path) {
    expect(isChatbotBannerExcludedPath(path, moduleUrl)).toBe(true);
  });

  it.each([
    "/",
    "/texts",
    "/Genesis.1",
    "/about",
    "/logout",
    "/login-help",
    "/register-interest",
    "/password",
    "/password/reset",
    "/passwords/reset",
    "/password/resetting",
    "/texts?next=%2Flogin",
  ])("does not exclude %s", function (path) {
    expect(isChatbotBannerExcludedPath(path, moduleUrl)).toBe(false);
  });

  // getModuleURL returns false when it cannot build a URL (e.g. server-side
  // rendering, where apiHost is empty) — the helper must not throw.
  it.each([false, undefined, ""])("still excludes /login when moduleUrl is %s", function (badModuleUrl) {
    expect(isChatbotBannerExcludedPath("/login", badModuleUrl)).toBe(true);
    expect(isChatbotBannerExcludedPath("/texts", badModuleUrl)).toBe(false);
  });

  it("returns false instead of throwing on an unparseable path", function () {
    expect(isChatbotBannerExcludedPath("http://", false)).toBe(false);
  });
});

describe("SiteWideBanner in a browser", function () {
  // Companion to siteWideBanner.ssr.test.js: after mounting client-side the banner
  // must still appear and still record the promo session in localStorage.
  const React = require("react");
  const ReactDOM = require("react-dom");
  const { act } = require("react-dom/test-utils");
  const { SiteWideBanner } = require("../SiteWideBanner");
  let container;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); localStorage.clear(); global.gtag = jest.fn(); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(container); }); container.remove(); });

  it("shows the banner after mount and records the session counter", function () {
    act(() => {
      ReactDOM.render(
        React.createElement(SiteWideBanner, {
          mainText: "Hello", actionButtons: () => null, cookieName: "test_banner", gtagParams: {}, enableBackoffDismissal: true,
        }),
        container
      );
    });
    expect(container.querySelector(".siteWideBanner")).not.toBeNull();
    expect(localStorage.getItem("promo_backoff_test_banner_session_counter")).toBe("1");
  });

  it("'Maybe later' records backoff state via the shared helper and hides the banner", function () {
    act(() => {
      ReactDOM.render(
        React.createElement(SiteWideBanner, {
          mainText: "Hello", actionButtons: () => null, cookieName: "test_banner", gtagParams: { campaignID: "c" }, enableBackoffDismissal: true,
        }),
        container
      );
    });
    act(() => {
      container.querySelector(".siteWideBannerMaybeLater").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(JSON.parse(localStorage.getItem("promo_backoff_test_banner_state"))).toEqual({
      maybeLaterCount: 1, lastDismissalTime: expect.any(Number), sessionCountAtLastDismissal: 1, dismissedForever: false,
    });
    expect(global.gtag).toHaveBeenCalledWith("event", "promo_clicked", { campaignID: "c", feature_name: "maybe_later" });
    expect(container.querySelector(".siteWideBanner")).toBeNull();
  });
});
