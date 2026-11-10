import { describe, expect, it } from "vitest";
import { inAppHref } from "./StaticPage";
import { mobileAppStoreUrls } from "./ports/MobileAppPage";

const plain = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const at = (href: string) => {
  const u = new URL(href);
  return { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search, host: u.host };
};
function link(html: string): Element {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.querySelector("a span") ?? div.querySelector("a")!;
}

// @feature STA-001 @feature RTE-040
describe("links inside a static page's content", () => {
  const here = at("https://www.sefaria.org/about");
  it("a same-site page this client renders is a navigation in the app (relative or absolute on this site)", () => {
    expect(inAppHref(link('<a href="/terms"><span>t</span></a>'), plain, here)).toBe("/terms");
    expect(inAppHref(link('<a href="https://www.sefaria.org/Genesis.1?lang=bi">g</a>'), plain, here)).toBe("/Genesis.1?lang=bi");
    expect(inAppHref(link('<a href="/texts#top">t</a>'), plain, here)).toBe("/texts#top");
  });
  it("Django's pages, other sites, Voices, new windows, downloads, modified clicks and this page's anchors are the browser's", () => {
    expect(inAppHref(link('<a href="/team">team</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="/static/files/a.pdf">pdf</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="https://voices.sefaria.org/collections/x">v</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="https://www.sefaria.org.il/about">he</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="/terms" target="_blank">t</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="/terms" download>t</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="/terms">t</a>'), { ...plain, metaKey: true }, here)).toBeNull();
    expect(inAppHref(link('<a href="/terms">t</a>'), { ...plain, button: 1 }, here)).toBeNull();
    expect(inAppHref(link('<a href="#section">s</a>'), plain, here)).toBeNull();
    expect(inAppHref(link('<a href="mailto:hello@sefaria.org">m</a>'), plain, here)).toBeNull();
    expect(inAppHref(document.createElement("p"), plain, here)).toBeNull();
  });
});

// @feature STA-008
describe("/mobile's store buttons", () => {
  it("carry a full UTM campaign to the stores (as the old page), else the plain store addresses", () => {
    expect(mobileAppStoreUrls("")).toEqual({ ios: "https://apps.apple.com/app/apple-store/id1163273965?mt=8", android: "https://play.google.com/store/apps/details?id=org.sefaria.sefaria" });
    expect(mobileAppStoreUrls("?utm_source=a&utm_medium=b")).toEqual(mobileAppStoreUrls(""));
    const u = mobileAppStoreUrls("?utm_source=news&utm_medium=email&utm_campaign=spring");
    expect(u.ios).toBe("https://apps.apple.com/app/apple-store/id1163273965?pt=118389482&ct=news-email-spring&mt=8");
    expect(u.android).toBe("https://play.google.com/store/apps/details?id=org.sefaria.sefaria&referrer=utm_source%3Dnews%26utm_medium%3Demail%26utm_campaign%3Dspring");
  });
});
