import { describe, expect, it } from "vitest";
import { highlightTerms } from "./highlight-terms";

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
