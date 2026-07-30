/* Testing done using Jest */
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
    "/password/reset",
    "/password/reset/",
    "/password/reset?next=%2Ftexts",
    "/password/reset/done/",
    "/password/reset/complete/",
    "/password/reset/confirm/user-id/token/",
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
    "/passwords/reset",
    "/password/resetting",
    "/texts?next=%2Flogin",
  ])("does not exclude %s", function (path) {
    expect(isChatbotBannerExcludedPath(path, moduleUrl)).toBe(false);
  });
});
