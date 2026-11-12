import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_SANDBOX, LINKER_BOOKMARKLET, sanitizeStaticHtml } from "./sanitize";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "e2e", "fixtures", "static-pages", `${name}.json`), "utf8")) as { html: string };
const clean = (html: string, page = "terms", siteOrigin = "") => sanitizeStaticHtml(html, { page, siteOrigin }).html;

// @feature STA-001 @feature STA-005
describe("sanitizeStaticHtml: the static page's content block", () => {
  it("keeps what the templates use: structure, classes, ids, inline styles, images, tables, media", () => {
    const html = '<div class="superAbout" id="x" style="text-align: center"><section><h1 class="aboutHeader">T</h1><img src="https://e.org/a.png" alt="A" width="10"><table border="0"><tr><td colspan="2">c</td></tr></table><video poster="/static/img/p.jpg" autoplay loop muted><source src="/static/img/v.mp4" type="video/mp4"></video><audio controls><source src="/static/files/t.mp3"></audio></section></div>';
    expect(clean(html)).toBe(html.replace(/<img([^>]*)>/, "<img$1>").replace("<source src=\"/static/img/v.mp4\" type=\"video/mp4\">", '<source src="/static/img/v.mp4" type="video/mp4">').replace("autoplay loop muted", 'autoplay="" loop="" muted=""').replace("<audio controls>", '<audio controls="">'));
  });

  it("runs nothing: scripts, handlers, javascript: and data: addresses, forms, objects", () => {
    const out = clean('<p onclick="x()" onmouseover="y()">a<script>alert(1)</script><a href="javascript:alert(1)">j</a><a href="data:text/html,x">d</a><img src="x" onerror="alert(1)"><form action="/x"><input name="q"><button>go</button></form><object data="x"></object><svg><script>1</script></svg><style>body{}</style></p>');
    // (the form closes the paragraph and the last </p> opens an empty one, as a browser reads it)
    expect(out).toBe('<p>a<a>j</a><a>d</a><img src="x"></p><p></p>');
  });

  it("a scheme hidden by entities, tabs, newlines or control characters is still seen and dropped", () => {
    for (const href of ["java&#9;script:alert(1)", "jav&#x0A;ascript:alert(1)", "&#1;javascript:alert(1)", " &#x20;javascript:alert(1)", "JaVaScRiPt:alert(1)", "java&Tab;script:alert(1)", "da&#9;ta:text/html,x", "vb&#13;script:x", "\\\\evil.example/x"]) {
      expect(clean(`<a href="${href}">x</a>`), href).toBe("<a>x</a>");
      expect(clean(`<img src="${href}">`), href).toBe("<img>");
    }
    // ...also on the Linker page (only its exact bookmarklet passes there)
    expect(clean('<a href="java&#9;script:alert(1)">x</a>', "linker")).toBe("<a>x</a>");
    const fine = '<a href="https://www.sefaria.org/texts">t</a><a href="mailto:a@b.org">m</a><a href="tel:+1">p</a><a href="/about#x">a</a>';
    expect(clean(fine)).toBe(fine);
  });

  // The address is judged and returned as ONE normalised string (trim() also removes Unicode whitespace)
  const UNICODE_PREFIXES = ["&nbsp;", "&#xA0;", "&#x2028;", "&#x2029;", "&#xFEFF;", "&#x3000;", "&#x1680;"];
  const PLACES: [string, (u: string) => string, string][] = [
    ["a href", (u) => `<a href="${u}">x</a>`, "<a>x</a>"],
    ["img src", (u) => `<img src="${u}">`, "<img>"],
    ["video poster", (u) => `<video poster="${u}"></video>`, "<video></video>"],
    ["q cite", (u) => `<q cite="${u}">x</q>`, "<q>x</q>"],
  ];
  for (const prefix of UNICODE_PREFIXES) {
    for (const [where, html, empty] of PLACES) {
      it(`${prefix} before javascript:, //evil.com and data: in ${where} is dropped`, () => {
        for (const bad of ["javascript:alert(1)", "//evil.com/x", "data:text/html,<script>alert(1)</script>".replace(/</g, "&lt;"), "/\\evil.com/x"]) {
          expect(clean(html(prefix + bad)), prefix + bad).toBe(empty);
          expect(clean(html(prefix + bad + prefix)), `${prefix}${bad}${prefix}`).toBe(empty);
        }
        // inside the scheme too
        expect(clean(html(`java${prefix}script:alert(1)`))).toBe(empty);
      });
    }
  }

  it("what is kept is the normalised address, the one that was judged", () => {
    expect(clean('<a href="&nbsp;https://www.sefaria.org/texts&#x3000;">t</a>')).toBe('<a href="https://www.sefaria.org/texts">t</a>');
    expect(clean('<img src="&#xFEFF;/static/img/a.png">', "terms", "https://www.sefaria.org")).toBe('<img src="https://www.sefaria.org/static/img/a.png">');
    expect(clean('<a href="/about">a</a><a href="#top">t</a><a href="?x=1">q</a>')).toBe('<a href="/about">a</a><a href="#top">t</a><a href="?x=1">q</a>');
  });

  it("frames only from the hosts the pages embed (Google Docs, YouTube), over https", () => {
    // Google's documents are sandboxed (their scripts, their own origin, links opening new windows)
    expect(clean('<iframe src="https://docs.google.com/document/d/e/x/pub?embedded=true"></iframe>')).toBe(`<iframe src="https://docs.google.com/document/d/e/x/pub?embedded=true" sandbox="${DOCS_SANDBOX}"></iframe>`);
    expect(clean('<iframe src="https://www.youtube-nocookie.com/embed/5PmBolxgXBY" allowfullscreen></iframe>')).toContain("youtube-nocookie");
    expect(clean('<iframe src="https://evil.example/x"><p>inside</p></iframe><p>after</p>')).toBe("<p>after</p>");
    expect(clean('<iframe src="http://www.youtube.com/embed/x"></iframe>')).toBe("");
    // the sandbox follows the src the frame keeps, not the raw one: leading Unicode whitespace still gets it
    for (const ws of ["&nbsp;", "&#x2028;", "&#xFEFF;", "&#x3000;"])
      expect(clean(`<iframe src="${ws}https://docs.google.com/x"></iframe>`)).toBe(`<iframe src="https://docs.google.com/x" sandbox="${DOCS_SANDBOX}"></iframe>`);
  });

  it("drops an inline style that does more than style", () => {
    expect(clean('<p style="background: url(javascript:alert(1))">x</p><p style="width: expression(alert(1))">y</p><p style="color: red">z</p>')).toBe('<p>x</p><p>y</p><p style="color: red">z</p>');
  });

  it("a link to a new window gets no opener; the site's /static/ files are addressed on the site's origin", () => {
    expect(clean('<a href="https://x.org" target="_blank">x</a>')).toBe('<a href="https://x.org" target="_blank" rel="noopener">x</a>');
    expect(clean('<a href="/static/files/a.pdf">p</a><img src="/static/img/a.png"><a href="/about">a</a>', "terms", "https://www.sefaria.org")).toBe(
      '<a href="https://www.sefaria.org/static/files/a.pdf">p</a><img src="https://www.sefaria.org/static/img/a.png"><a href="/about">a</a>',
    );
  });

  it("the About sidebar as its script leaves it on a desktop: the page's item selected, the sidebar classed by the page", () => {
    const out = clean(fixture("terms.en").html, "terms");
    expect(out).toContain('<nav id="aboutSidebar" class="terms">');
    expect(out).toContain('<a id="terms" href="/terms" class="selected">');
    expect(out.match(/class="selected"/g)).toHaveLength(1);
    expect(out).not.toContain("<script");
    expect(out).toContain('<iframe src="https://docs.google.com/document/d/e/');
    expect(out).toContain(`sandbox="${DOCS_SANDBOX}"`);
  });

  it("mobile-about-menu: no item of its own (the old script threw there): nothing selected; its stylesheet link is lifted out", () => {
    const res = sanitizeStaticHtml(fixture("mobile-about-menu.en").html, { page: "mobile-about-menu", siteOrigin: "" });
    expect(res.html).not.toContain("selected");
    expect(res.html).toContain('<nav id="aboutSidebar">');
    expect(res.stylesheets).toEqual(["/static/css/about.css"]);
    expect(res.html).not.toContain("<link");
  });

  it("the Linker page keeps its bookmarklet (it only loads the site's linker.js); nowhere else", () => {
    const html = fixture("linker.en").html;
    expect(clean(html, "linker")).toMatch(/href="javascript: \(function \(\) \{[^"]*https:\/\/www\.sefaria\.org\/linker\.js/);
    // exactly the template's bookmarklet: anything added to it (even loading the same script) is dropped
    expect(clean(`<a href="${LINKER_BOOKMARKLET.replace("}());", "fetch('https://evil.example'); }());")}">x</a>`, "linker")).toBe("<a>x</a>");
    expect(clean(html, "terms")).not.toContain("javascript:");
    expect(clean(`<a href="javascript:(function(){fetch('https://evil.example')}());">x</a>`, "linker")).toBe("<a>x</a>");
  });

  it("a textarea's markup stays text (design-system), and stays read-only", () => {
    expect(clean("<textarea><div><h1>T</h1></div></textarea>", "design-system")).toBe('<textarea readonly=""><div><h1>T</h1></div></textarea>'.replace("<div><h1>T</h1></div>", "&lt;div&gt;&lt;h1&gt;T&lt;/h1&gt;&lt;/div&gt;"));
  });

  it("closes what the templates leave open, as a browser does (design-system's `<small>…</p>`)", () => {
    expect(clean("<div><small>x</p></div><p>y")).toBe("<div><small>x<p></p></small></div><p>y</p>");
  });
});

// the shell has the page's <main>; a page's own (about, team, the Hebrew ways-to-give…) would be a second one inside it
describe("sanitizeStaticHtml: one main", () => {
  it("a page's <main> is written as a <div>, with its id and classes, closed in the right place", () => {
    const { html } = sanitizeStaticHtml('<main id="aboutPage" class="biReady container static"><div><p>x</p></div><p>y</p></main><p>z</p>', { page: "about" });
    expect(html).toBe('<div id="aboutPage" class="biReady container static"><div><p>x</p></div><p>y</p></div><p>z</p>');
  });
  it("an unclosed <main> is closed as a <div>", () => {
    expect(sanitizeStaticHtml("<main><div>a", { page: "about" }).html).toBe("<div><div>a</div></div>");
  });
});
