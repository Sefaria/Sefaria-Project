import { describe, expect, it } from "vitest";
import { errorPageLang, retryHref, unavailableResponse } from "./error-page";
import { upstreamUnavailable } from "./pass-through";

// @feature RTE-040
describe("the page for an upstream failure (T-F28)", () => {
  it("is a real page, still 503 with Retry-After, never stored, never indexed", async () => {
    const r = upstreamUnavailable(new Request("http://x/Genesis.1?lang=he"));
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("5");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(r.headers.get("content-type")).toContain("text/html");
    const body = await r.text();
    expect(body).toContain("<!DOCTYPE html>");
    expect(body).toContain("The library is not answering right now");
    expect(body).toContain('href="/Genesis.1?lang=he"'); // try again: the same address
    expect(body).toContain('href="/texts"');
    expect(body).toContain('name="robots" content="noindex"');
  });
  it("speaks the interface language of the cookie", async () => {
    expect(errorPageLang("a=1; interfaceLang=hebrew")).toBe("hebrew");
    expect(errorPageLang("interfaceLang=english")).toBe("english");
    expect(errorPageLang(null)).toBe("english");
    const body = await unavailableResponse(new Request("http://x/texts", { headers: { cookie: "interfaceLang=hebrew" } })).text();
    expect(body).toContain('dir="rtl"');
    expect(body).toContain("הספרייה אינה זמינה כרגע");
  });
  it("escapes the address it links back to; a HEAD gets no body; no request still answers", async () => {
    const body = await unavailableResponse(new Request('http://x/a"><script>')).text();
    expect(body).not.toContain("<script>");
    expect(unavailableResponse(new Request("http://x/t", { method: "HEAD" })).body).toBeNull();
    expect(upstreamUnavailable().status).toBe(503);
  });
  it("Try again never leaves the site: leading slashes collapse to one", async () => {
    expect(retryHref(new URL("http://x//evil.com/a?b=1"))).toBe("/evil.com/a?b=1");
    expect(retryHref(new URL("http://x/Genesis.1"))).toBe("/Genesis.1");
    const body = await unavailableResponse(new Request("http://x//evil.com/x")).text();
    expect(body).toContain('href="/evil.com/x"');
    expect(body).not.toContain('href="//evil.com');
  });
  it("the Voices host keeps the old plain-text 503 (nothing new on Voices)", async () => {
    for (const host of ["voices.sefaria.org", "chiburim.sefaria.org.il"]) {
      const r = unavailableResponse(new Request("http://x/sheets/1", { headers: { "x-forwarded-host": host } }), "https://voices.sefaria.org");
      expect([r.status, r.headers.get("retry-after"), r.headers.get("content-type")]).toEqual([503, "5", "text/plain; charset=utf-8"]);
      expect(await r.text()).toBe("The library is not answering right now. Please try again in a moment.");
    }
  });
});
