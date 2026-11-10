import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeStaticHtml } from "./sanitize";

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

  it("frames only from the hosts the pages embed (Google Docs, YouTube), over https", () => {
    expect(clean('<iframe src="https://docs.google.com/document/d/e/x/pub?embedded=true"></iframe>')).toBe('<iframe src="https://docs.google.com/document/d/e/x/pub?embedded=true"></iframe>');
    expect(clean('<iframe src="https://www.youtube-nocookie.com/embed/5PmBolxgXBY" allowfullscreen></iframe>')).toContain("youtube-nocookie");
    expect(clean('<iframe src="https://evil.example/x"><p>inside</p></iframe><p>after</p>')).toBe("<p>after</p>");
    expect(clean('<iframe src="http://www.youtube.com/embed/x"></iframe>')).toBe("");
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
