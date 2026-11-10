import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { normaliseTexts, type RawTextsResponse } from "./model";
import { isFullSegmentImage, prepareSegmentHtml, stripTalmudPunctuation } from "./prepare";

const seg = (slug: string, side: "primary" | "translation", pred: (h: string) => boolean) => {
  const p = normaliseTexts(readFixture<RawTextsResponse>(`${slug}/v3-texts.json`));
  const s = p.segments.find((x) => pred(x[side] ?? ""));
  if (!s) throw new Error(`no matching segment in ${slug}`);
  return s[side]!;
};

// @feature TXD-021
describe("citations become real links", () => {
  it("links a citation to the canonical path", () => {
    const html = seg("rashi-on-genesis-1", "primary", (h) => h.includes("Psalms 111:6"));
    const out = prepareSegmentHtml(html).html;
    expect(out).toContain('<a class="ref-link" data-sefaria-ref="Psalms 111:6" href="/Psalms.111.6" tabindex="-1">');
  });
  it("links named entities to their topic", () => {
    const out = prepareSegmentHtml(seg("jt-berakhot-1-1", "primary", (h) => h.includes("namedEntityLink"))).html;
    // this client's topic page (relative); a Voices host passes libraryHref's absolute address
    expect(out).toContain('href="/topics/rabbi-eliezer-b-hyrcanus"');
    const voices = prepareSegmentHtml(seg("jt-berakhot-1-1", "primary", (h) => h.includes("namedEntityLink")), { topicHref: (s) => `https://www.sefaria.org/topics/${s}` }).html;
    expect(voices).toContain('href="https://www.sefaria.org/topics/rabbi-eliezer-b-hyrcanus"');
  });
  it("honours a custom href builder", () => {
    const out = prepareSegmentHtml('<a class="refLink" href="x" data-ref="Genesis 1:1">Gen</a>', { refHref: (r) => `/app?ref=${r}` }).html;
    expect(out).toContain('href="/app?ref=Genesis 1:1"');
  });
});

// @feature TXD-025
describe("footnotes", () => {
  it("replaces footnote bodies with accessible markers and returns the notes", () => {
    const html = seg("genesis-1", "translation", (h) => h.includes("footnote-marker"));
    const { html: out, notes } = prepareSegmentHtml(html);
    expect(out).toContain('<sup aria-expanded="false" class="note-marker" data-note="0" role="button" tabindex="-1">a</sup>');
    expect(out).not.toContain("In contrast to others");
    expect(notes[0]).toMatchObject({ key: 0, markerHtml: "a" });
    expect(notes[0]!.contentHtml).toContain("In contrast to others");
  });
});

// @feature TXD-051
describe("poetry", () => {
  it("keeps indentation markers", () => {
    const out = prepareSegmentHtml(seg("psalms-23", "translation", (h) => h.includes("poetry"))).html;
    expect(out).toContain('data-sefaria-poetry="indent"');
    expect(out).toContain('data-sefaria-poetry="indent-double"');
  });
});

// @feature TXD-028 @feature TXT-008
describe("page overlays", () => {
  it("renders Vilna page markers with their value", () => {
    const out = prepareSegmentHtml(seg("jt-berakhot-1-1", "primary", (h) => h.includes("Vilna Pages"))).html;
    expect(out).toContain('class="page-marker"');
    expect(out).toContain('data-value="1a"');
    expect(out).toMatch(/<span[^>]*class="page-marker"[^>]*>1a<\/span>/);
  });
});

// @feature TXD-027
describe("itags (commentary markers)", () => {
  const html = seg("shulchan-arukh-oc-1", "primary", (h) => h.includes("Turei Zahav"));
  it("are invisible without a commentator filter", () => {
    expect(prepareSegmentHtml(html).html).not.toContain("itag");
  });
  it("show a superscript for the filtered commentator only", () => {
    const out = prepareSegmentHtml(html, { itagCommentator: "Turei Zahav", lang: "he" }).html;
    expect(out).toContain('class="itag"');
    expect(out).toMatch(/<sup[^>]*class="itag"[^>]*>א<\/sup>/);
    expect(out).not.toContain("Ba&apos;er Hetev");
    expect((out.match(/class="itag"/g) ?? []).length).toBeGreaterThan(0);
  });
  it("uses the label when present and Arabic numerals in English", () => {
    const out = prepareSegmentHtml(`x<i data-commentator="A" data-order="3"></i>`, { itagCommentator: "A", lang: "en" }).html;
    expect(out).toContain(">3</sup>");
    const lbl = prepareSegmentHtml(`x<i data-commentator="A" data-label="ג" data-order="3"></i>`, { itagCommentator: "A", lang: "en" }).html;
    expect(lbl).toContain(">ג</sup>");
  });
});

describe("vocalization", () => {
  const he = seg("genesis-1", "primary", () => true);
  it("keeps everything by default", () => {
    expect(prepareSegmentHtml(he, { vocalization: "taamim_and_nikkud" }).html).toContain("֖");
  });
  it("removes cantillation but keeps nikud", () => {
    const out = prepareSegmentHtml(he, { vocalization: "nikkud" }).html;
    expect(out).not.toMatch(/[֑-֯]/);
    expect(out).toMatch(/[ְ-ּ]/);
  });
  it("removes all points", () => {
    expect(prepareSegmentHtml(he, { vocalization: "none" }).html).not.toMatch(/[֑-ׇ]/);
  });
});

describe("safety", () => {
  it("drops scripts, handlers and unknown attributes", () => {
    const out = prepareSegmentHtml('<b onclick="x()">hi</b><script>alert(1)</script><img src=x onerror=alert(1)>').html;
    expect(out).toBe("<b>hi</b>");
  });
});

// @feature TXT-006 Talmud punctuation toggle and stripping
describe("Talmud punctuation", () => {
  it("removes sentence punctuation", () => {
    expect(stripTalmudPunctuation("אמר רבי, ירמיה: שלום.")).toBe("אמר רבי ירמיה שלום");
  });
  it("protects abbreviations (a gershayim before a single final letter)", () => {
    expect(stripTalmudPunctuation("אמר ר״א שלום")).toBe("אמר ר״א שלום");
    expect(stripTalmudPunctuation("ר״א: אמר")).toBe("ר״א אמר");
  });
  it("removes an en or em dash followed by a space", () => {
    expect(stripTalmudPunctuation("א — ב – ג")).toBe("א ב ג");
  });
  it("applies to text only, never to links or attributes", () => {
    const html = 'ראו (<a class="refLink" href="Psalms.111.6" data-ref="Psalms 111:6">תהילים קי"א</a>), ועוד:';
    const out = prepareSegmentHtml(html, { stripPunctuation: true }).html;
    expect(out).toContain('href="/Psalms.111.6"');
    expect(out).toContain('data-sefaria-ref="Psalms 111:6"');
    expect(out).not.toContain("),");
    expect(out.endsWith("ועוד")).toBe(true);
  });
  it("leaves the text untouched unless asked", () => {
    expect(prepareSegmentHtml("א, ב: ג.").html).toBe("א, ב: ג.");
  });
  it("works on a real Talmud segment", () => {
    const he = seg("berakhot-2a", "primary", () => true);
    const plain = prepareSegmentHtml(he, { stripPunctuation: true }).html;
    expect(plain.length).toBeLessThan(prepareSegmentHtml(he).html.length);
    const visible = plain.replace(/<[^>]*>/g, "");
    expect(visible).not.toMatch(/[:,]/);
  });
});

// @feature TXD-026 Inline images in text
describe("images", () => {
  const SRC = "https://textimages.sefaria.org/et/diagram.png";
  it("a segment that is only an image becomes the image with its alt text as the caption", () => {
    const p = prepareSegmentHtml(`  <img src="${SRC}" alt="The courtyard">  `);
    expect(p.fullImage).toBe(true);
    expect(p.html.trim()).toBe(`<span class="image-in-text"><img alt="" decoding="async" loading="eager" src="${SRC}"><span class="image-in-text-title">The courtyard</span></span>`);
  });
  it("an image in running text stays inline", () => {
    const p = prepareSegmentHtml(`see <img src="${SRC}" alt="fig. 1"> here`);
    expect(p.fullImage).toBe(false);
    expect(p.html).toBe(`see <img alt="fig. 1" decoding="async" loading="lazy" src="${SRC}"> here`);
  });
  it("keeps a base64 image (legacy's data:image sources) and drops any other source to its alt text", () => {
    expect(prepareSegmentHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="x">').html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(prepareSegmentHtml('a <img src="javascript:alert(1)" alt="bad"> b').html).toBe("a bad b");
    expect(prepareSegmentHtml('a <img src="data:text/html;base64,PHNjcmlwdD4=" alt="bad"> b').html).toBe("a bad b");
    expect(prepareSegmentHtml('a <img src="https://x.org/a.png" onerror="alert(1)" alt="ok"> b').html).not.toContain("onerror");
  });
  it("isFullSegmentImage is legacy's regex", () => {
    expect(isFullSegmentImage(`<img src="${SRC}">`)).toBe(true);
    expect(isFullSegmentImage(`text <img src="${SRC}">`)).toBe(false);
    expect(isFullSegmentImage(undefined)).toBe(false);
  });
});

// @feature TXD-023 Inline category links in text
describe("category mentions and plain links", () => {
  it("a category mention links to its library page", () => {
    const out = prepareSegmentHtml('In the <a class="categoryLink " href="/texts/Tanakh/Torah" data-category-path="Tanakh/Torah" data-range=3-8>Torah</a> we read').html;
    expect(out).toBe('In the <a class="category-link" data-category-path="Tanakh/Torah" href="/texts/Tanakh/Torah" tabindex="-1">Torah</a> we read');
    const voices = prepareSegmentHtml('<a class="categoryLink" data-category-path="Second Temple">x</a>', { categoryHref: (p) => `https://www.sefaria.org/texts/${p}` }).html;
    expect(voices).toContain('href="https://www.sefaria.org/texts/Second%20Temple"');
  });
  // @feature TXD-020
  it("a plain link keeps an http(s) or site address; any other is unwrapped", () => {
    expect(prepareSegmentHtml('see <a href="https://example.org/x">this</a>').html).toBe('see <a href="https://example.org/x" rel="noopener noreferrer" tabindex="-1">this</a>');
    expect(prepareSegmentHtml('see <a href="/Genesis.1.1">this</a>').html).toBe('see <a href="/Genesis.1.1" tabindex="-1">this</a>');
    expect(prepareSegmentHtml('see <a href="javascript:alert(1)">this</a>').html).toBe("see this");
    expect(prepareSegmentHtml('see <a href="//evil.org">this</a>').html).toBe("see this");
  });
});
