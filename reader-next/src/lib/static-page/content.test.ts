import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchStaticPage, pageInlineCss, remToPx, parseStaticContent, safeInlineCss, staticContentPath, staticPageModel } from "./content";
import { cachedStaticPage, clearStaticPageCache } from "./load";
import { absoluteUrls, scopeCss, scopeSelector } from "./scope-css";

const raw = (name: string) => readFileSync(join(__dirname, "..", "..", "..", "e2e", "fixtures", "static-pages", `${name}.json`), "utf8");
const answer = (body: string, status = 200, type = "application/json") => (async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

// @feature STA-001 @feature STA-007
describe("a static page's content from Django (?format=json&lang=…)", () => {
  it("asks with the language, always (so the answer is public and cacheable)", async () => {
    expect(staticContentPath("about", "he")).toBe("/about?format=json&lang=he");
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return new Response(raw("terms.en"), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await fetchStaticPage("terms", "en", "http://varnish:8040", "", fetcher);
    expect(asked).toEqual(["http://varnish:8040/terms?format=json&lang=en"]);
  });

  it("a page: its title, description, sanitised content; no unscoped stylesheet (static.css is served scoped; others are left out, logged)", async () => {
    const res = await fetchStaticPage("terms", "en", "", "https://www.sefaria.org", answer(raw("terms.en")));
    expect(res.kind).toBe("page");
    if (res.kind !== "page") return;
    expect(res.model.title).toBe("Terms of Use | Sefaria");
    expect(res.model.html).not.toContain("<script");
    expect(res.model.css).toEqual([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const about = staticPageModel("mobile-about-menu", parseStaticContent(JSON.parse(raw("mobile-about-menu.en")))!, "https://www.sefaria.org");
    expect(about.css).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/static/css/about.css"));
    warn.mockRestore();
  });

  it("Hebrew: the Hebrew answer, Hebrew body class", async () => {
    const res = await fetchStaticPage("about", "he", "", "", answer(raw("about.he")));
    expect(res.kind === "page" && [res.model.lang, res.model.bodyClass]).toEqual(["he", "interface-hebrew"]);
  });

  it("a 404 (no such page, a standalone document) is missing; an HTML page (a Django without the content mode) is unsupported", async () => {
    expect((await fetchStaticPage("x", "en", "", "", answer('{"error":"x","standalone":true}', 404))).kind).toBe("missing");
    expect((await fetchStaticPage("terms", "en", "", "", answer("<!DOCTYPE html><html>", 200, "text/html; charset=utf-8"))).kind).toBe("unsupported");
    expect((await fetchStaticPage("terms", "en", "", "", answer('{"nope":1}'))).kind).toBe("unsupported");
  });

  it("Django's trouble is the page's: a 5xx throws (the page answers 503)", async () => {
    await expect(fetchStaticPage("terms", "en", "", "", answer("", 502))).rejects.toThrow(/502/);
  });

  it("the inline CSS cannot close its <style>, and is scoped like the legacy sheets (so it still wins over them, as on the old page)", () => {
    expect(safeInlineCss("a{}</style><script>x</script>")).toBe("a{}\\3c /style>\\3c script>x\\3c /script>");
    // a comment inside the tag names is gone after scoping: the escaping comes after it, so nothing can close the <style>
    const sneaky = pageInlineCss(".a { color: red; x: </sty/**/le><scr/**/ipt>alert(1)</scr/**/ipt> }");
    expect(sneaky).not.toMatch(/<\/?(style|script)/i);
    expect(sneaky).not.toContain("<");
    expect(pageInlineCss(".static h2 { text-transform: none; }")).toBe("#staticContentWrapper .static h2 { text-transform: none; }\n");
    expect(pageInlineCss("  ")).toBe("");
  });

  it("a page that sets the document's font size (pioneers) has its rems made pixels of that size", () => {
    expect(remToPx("html {\n  font-size: 10px;\n}\n#p { font-size: 1.6rem; padding: 11.5rem 0 -.5rem; }")).toBe("html {\n  font-size: 10px;\n}\n#p { font-size: 16px; padding: 115px 0 -5px; }");
    expect(remToPx("#p { font-size: 1.6rem; }")).toBe("#p { font-size: 1.6rem; }");
  });

  it("is kept a few minutes per page and language; a failure is not kept", async () => {
    clearStaticPageCache();
    let calls = 0;
    const load = () => {
      calls++;
      return Promise.resolve({ kind: "missing" as const });
    };
    await cachedStaticPage("terms", "en", load, 0);
    await cachedStaticPage("terms", "en", load, 60_000);
    await cachedStaticPage("terms", "he", load, 60_000);
    await cachedStaticPage("terms", "en", load, 10 * 60_000);
    expect(calls).toBe(3);
    const failing = () => Promise.reject(new Error("down"));
    await cachedStaticPage("about", "en", failing, 0).catch(() => undefined);
    await Promise.resolve();
    expect(await cachedStaticPage("about", "en", load, 1)).toEqual({ kind: "missing" });
  });
});

// @feature STA-001
describe("scopeCss: the legacy stylesheets under the static page's wrapper", () => {
  const S = "#w";
  it("puts every selector under the wrapper; the document's own rules apply to the wrapper", () => {
    expect(scopeSelector(".static .inner", S)).toBe("#w .static .inner");
    expect(scopeSelector("body", S)).toBe("#w");
    expect(scopeSelector("body.interface-hebrew #x", S)).toBe("#w.interface-hebrew #x");
    expect(scopeSelector(":root", S)).toBe("#w");
    expect(scopeSelector("html body .a", S)).toBe("#w .a");
    expect(scopeSelector("#w .a", S)).toBe("#w .a");
    expect(scopeSelector("bodyText", S)).toBe("#w bodyText");
  });
  it("scopes inside @media, keeps @font-face and @keyframes, drops comments, respects strings and :not(a, b)", () => {
    const css = `/* c */ a, p:not(.x, .y) { color: red; content: "}{"; }
@media (max-width: 480px) { .a { b: c } }
@font-face { font-family: X; src: url(x.woff); }
@keyframes k { from { opacity: 0 } to { opacity: 1 } }
@charset "UTF-8";`;
    expect(scopeCss(css, S)).toBe(`#w a,\n#w p:not(.x, .y) { color: red; content: "}{"; }\n@media (max-width: 480px) {\n#w .a { b: c }\n}\n@font-face { font-family: X; src: url(x.woff); }\n@keyframes k { from { opacity: 0 } to { opacity: 1 } }\n`);
  });
  it("addresses relative url()s from the stylesheet's own folder", () => {
    expect(absoluteUrls("a{src:url('../fonts/f.woff?v=1') url(/static/x.png) url(data:image/png;base64,x)}", "/static/font-awesome/css/fa.css")).toBe(
      "a{src:url('/static/font-awesome/fonts/f.woff?v=1') url(/static/x.png) url(data:image/png;base64,x)}",
    );
  });
});
