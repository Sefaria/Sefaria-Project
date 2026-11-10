import { describe, expect, it } from "vitest";
import { errorPageLang, unavailableResponse } from "./error-page";
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
});
