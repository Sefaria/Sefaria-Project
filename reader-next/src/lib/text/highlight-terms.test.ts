import { describe, expect, it } from "vitest";
import { highlightTerms } from "./highlight-terms";
import { prepareSegmentHtml } from "./prepare";

const W = (s: string) => `<span class="queryTextHighlight">${s}</span>`;

// @feature SRC-058 @feature TXT-027
describe("highlightTerms", () => {
  it("wraps a word, any case", () => {
    expect(highlightTerms("God said, “Let there be light”; and there was Light.", ["light"])).toBe(`God said, “Let there be ${W("light")}”; and there was ${W("Light")}.`);
  });
  it("a phrase matches across inline tags and keeps the markup valid", () => {
    const out = highlightTerms("the <i>light of</i> day", ["light of day"]);
    expect(out).toBe(`the <i>${W("light of")}</i>${W(" day")}`.replace("</i>" + W(" day"), "</i>" + W(" day")));
    expect(out.replace(/<span class="queryTextHighlight">|<\/span>/g, "")).toBe("the <i>light of</i> day");
  });
  it("Hebrew: vowels and cantillation in the text do not matter", () => {
    const out = highlightTerms("בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים", ["בראשית ברא"]);
    expect(out.replace(/<span class="queryTextHighlight">|<\/span>/g, "")).toBe("בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים");
    expect(out.startsWith(`<span class="queryTextHighlight">בְּרֵאשִׁ֖ית`)).toBe(true);
    expect(out).not.toContain("אֱלֹהִ֑ים</span>");
  });
  it("every occurrence; tag attributes and entities are never touched", () => {
    const out = highlightTerms('<a href="/light" class="x">light</a> &amp; light', ["light"]);
    expect(out).toBe(`<a href="/light" class="x">${W("light")}</a> &amp; ${W("light")}`);
  });
  it("no terms or no match: unchanged", () => {
    expect(highlightTerms("abc", [])).toBe("abc");
    expect(highlightTerms("abc", ["zzz"])).toBe("abc");
  });
});

// CODE_REVIEW R-02: attribute values from API text may hold `>`; highlighting must never break out of an attribute
describe("highlighting cannot inject markup", () => {
  const live = (html: string) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return [...d.querySelectorAll("*")].filter((e) => e.tagName === "IMG" || e.tagName === "SCRIPT" || [...e.attributes].some((a) => a.name.startsWith("on")));
  };
  const payloads: [string, Parameters<typeof prepareSegmentHtml>[1]?][] = [
    [`<a class="refLink" data-ref="Genesis 1:1&gt;foo&lt;img src=x onerror=alert(1)&gt;">Genesis foo</a> foo`],
    [`text <i data-commentator="X&gt;foo&lt;img src=x onerror=alert(2)&gt;" data-order="1"></i> foo`, { itagCommentator: "zzz" }],
    [`x <i data-overlay="Vilna Pages" data-value="1a&gt;foo&lt;img src=x onerror=alert(3)&gt;"></i> foo`],
  ];
  it.each(payloads)("%s", (raw, opts) => {
    const prepared = prepareSegmentHtml(raw, opts);
    expect(prepared.html).not.toMatch(/="[^"]*[<>]/); // no raw bracket inside any attribute value
    const out = highlightTerms(prepared.html, ["foo"]);
    expect(live(out)).toEqual([]);
    expect(out).toContain(W("foo"));
  });

  it("a raw `>` inside a quoted attribute does not end the tag", () => {
    const out = highlightTerms(`<i data-x="a>foo<b">bar</i> foo`, ["foo"]);
    expect(live(out)).toEqual([]);
    expect(out.startsWith(`<i data-x="a>foo<b">`)).toBe(true);
  });
});
