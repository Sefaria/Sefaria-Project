import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { normaliseTexts, type RawTextsResponse } from "./model";
import { prepareSegmentHtml, stripTalmudPunctuation } from "./prepare";

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
    expect(out).toContain('<a class="ref-link" data-sefaria-ref="Psalms 111:6" href="/Psalms.111.6">');
  });
  it("links named entities to their topic", () => {
    const out = prepareSegmentHtml(seg("jt-berakhot-1-1", "primary", (h) => h.includes("namedEntityLink"))).html;
    expect(out).toContain('href="https://www.sefaria.org/topics/rabbi-eliezer-b-hyrcanus"');
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
    expect(out).toContain('<sup aria-expanded="false" class="note-marker" data-note="0" role="button" tabindex="0">a</sup>');
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
