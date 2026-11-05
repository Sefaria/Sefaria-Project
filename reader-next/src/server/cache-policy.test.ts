import { describe, expect, it } from "vitest";
import { pageCacheHeaders } from "./cache-policy";

const html = (extra: Record<string, string> = {}) => new Headers({ "content-type": "text/html; charset=utf-8", vary: "Origin", ...extra });

// CODE_REVIEW R-27: a signed-in reader's page must never be kept by a shared cache
describe("pageCacheHeaders", () => {
  it("a signed-in reader's page is private and never stored", () => {
    const h = pageCacheHeaders("csrftoken=a; sessionid=xyz; interfaceLang=english", html());
    expect(h.get("cache-control")).toBe("private, no-store");
    expect(h.get("vary")).toBe("Origin, Cookie, CF-IPCountry");
  });
  it("an anonymous page varies on cookies and is revalidated", () => {
    const h = pageCacheHeaders("interfaceLang=hebrew", html());
    expect(h.get("cache-control")).toBe("no-cache");
    expect(h.get("vary")).toBe("Origin, Cookie, CF-IPCountry");
    expect(pageCacheHeaders(null, html()).get("cache-control")).toBe("no-cache");
  });
  it("a redirect or an error page is not marked no-cache (a permanent redirect stays cacheable)", () => {
    expect(pageCacheHeaders(null, html(), 301).get("cache-control")).toBeNull();
    expect(pageCacheHeaders(null, html(), 404).get("cache-control")).toBeNull();
    expect(pageCacheHeaders("sessionid=1", html(), 301).get("cache-control")).toBe("private, no-store");
  });
  it("a cookie merely named like the session one does not count", () => {
    expect(pageCacheHeaders("xsessionid=1", html()).get("cache-control")).toBe("no-cache");
  });
  it("leaves Django's pages and non-HTML answers alone", () => {
    const django = html({ "x-served-by": "django", "cache-control": "max-age=60" });
    expect(pageCacheHeaders("sessionid=1", django).get("cache-control")).toBe("max-age=60");
    const json = new Headers({ "content-type": "application/json" });
    expect(pageCacheHeaders("sessionid=1", json).get("cache-control")).toBeNull();
  });
});
