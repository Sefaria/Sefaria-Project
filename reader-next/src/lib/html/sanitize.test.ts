import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("keeps text-level markup and links", () => {
    expect(sanitizeHtml('Dedicated in honor of <b>all</b> women.<br><br>\n<a href="https://www.sefaria.org/sheets/382047">Read the preface</a>')).toBe(
      'Dedicated in honor of <b>all</b> women.<br><br>\n<a href="https://www.sefaria.org/sheets/382047" target="_blank" rel="noopener noreferrer">Read the preface</a>',
    );
  });
  it("drops scripts and everything inside them, event handlers, styles and unknown tags", () => {
    const dirty = '<p onclick="x()" style="color:red">Hi<script>alert(1)</script><iframe src="//evil"><b>in</b></iframe><img src=x onerror=alert(2)><custom>kept text</custom></p>';
    expect(sanitizeHtml(dirty)).toBe("<p>Hikept text</p>");
  });
  it("refuses javascript:, data: and protocol-relative links but keeps the text", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><a href="//evil.example">c</a><a href=" JaVaScRiPt:alert(1)">d</a>')).toBe("<a>a</a><a>b</a><a>c</a><a>d</a>");
  });
  it("makes paths absolute against the base URL, and leaves anchors alone", () => {
    expect(sanitizeHtml('<a href="/Genesis/en/Foo/notes">notes</a><a href="#top">up</a>', { baseUrl: "https://www.sefaria.org" })).toBe(
      '<a href="https://www.sefaria.org/Genesis/en/Foo/notes" target="_blank" rel="noopener noreferrer">notes</a><a href="#top">up</a>',
    );
  });
  it("escapes text and attribute values", () => {
    expect(sanitizeHtml('<a href="https://x.example/?a=1&b=\\"2\\"">1 < 2 & 3</a>')).toContain("&amp;");
    expect(sanitizeHtml("1 < 2 & 3")).toBe("1 &lt; 2 &amp; 3");
  });
  it("closes what it opened and ignores stray closers (a stray </p> is an empty paragraph, as in HTML)", () => {
    expect(sanitizeHtml("<b>bold <i>both</b> plain</i></em>")).toBe("<b>bold <i>both</i></b> plain");
    expect(sanitizeHtml("<b>unclosed")).toBe("<b>unclosed</b>");
  });
  it("keeps only the extra attributes it is told to, escaped, and never event handlers", () => {
    const html = '<a class="refLink" href="/Genesis.1.1" data-ref="Genesis 1:1" onclick="x()" style="a">Gen. I, 1</a><span class="x">t</span>';
    expect(sanitizeHtml(html)).toBe('<a href="/Genesis.1.1">Gen. I, 1</a><span>t</span>');
    expect(sanitizeHtml(html, { keepAttributes: { a: ["class", "data-ref", "onclick"] } })).toBe('<a href="/Genesis.1.1" class="refLink" data-ref="Genesis 1:1">Gen. I, 1</a><span>t</span>');
    expect(sanitizeHtml('<a data-ref=\'x" onmouseover="y\' href="/p">z</a>', { keepAttributes: { a: ["data-ref"] } })).toBe('<a href="/p" data-ref="x&quot; onmouseover=&quot;y">z</a>');
  });

  it("keeps lang and dir only when valid", () => {
    expect(sanitizeHtml('<span lang="he" dir="rtl">א</span><span lang="x y" dir="bogus">b</span>')).toBe('<span lang="he" dir="rtl">א</span><span>b</span>');
  });
});

describe("markdownToHtml", () => {
  it("renders markdown and strips raw HTML", () => {
    expect(markdownToHtml("Genesis is **the first** book.\n\n[Rashi](https://www.sefaria.org/topics/rashi)")).toBe(
      '<p>Genesis is <strong>the first</strong> book.</p>\n<p><a href="https://www.sefaria.org/topics/rashi" target="_blank" rel="noopener noreferrer">Rashi</a></p>\n',
    );
    expect(markdownToHtml("hi <script>alert(1)</script>")).not.toContain("script");
    expect(markdownToHtml(undefined)).toBe("");
  });
});
