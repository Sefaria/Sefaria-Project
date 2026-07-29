/* Testing done using Jest */
import { isChatbotBannerExcludedPath } from "../SiteWideBanner";

describe("isChatbotBannerExcludedPath", function () {
  it("excludes the login page", function () {
    expect(isChatbotBannerExcludedPath("/login")).toBe(true);
  });

  it("excludes the register page", function () {
    expect(isChatbotBannerExcludedPath("/register")).toBe(true);
  });

  it("tolerates trailing slashes", function () {
    expect(isChatbotBannerExcludedPath("/login/")).toBe(true);
    expect(isChatbotBannerExcludedPath("/register/")).toBe(true);
  });

  it("ignores query strings and hashes", function () {
    expect(isChatbotBannerExcludedPath("/login?next=%2Ftexts")).toBe(true);
    expect(isChatbotBannerExcludedPath("/register/?next=%2Ftexts#top")).toBe(true);
  });

  it("does not exclude other pages", function () {
    expect(isChatbotBannerExcludedPath("/")).toBe(false);
    expect(isChatbotBannerExcludedPath("/texts")).toBe(false);
    expect(isChatbotBannerExcludedPath("/Genesis.1")).toBe(false);
    expect(isChatbotBannerExcludedPath("/logout")).toBe(false);
    expect(isChatbotBannerExcludedPath("/texts?next=%2Flogin")).toBe(false);
  });
});
