// @feature LEG-010
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCompareSetup, normRef, sectionTextUrl, subrefCount, versionTitlesFor } from "./queries";

afterEach(() => vi.unstubAllGlobals());

/** Answer the name, texts and shape APIs from a table keyed by path prefix. */
function stubApi(answers: Record<string, unknown>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url).pathname;
    const key = Object.keys(answers).find((k) => path.startsWith(k));
    return new Response(JSON.stringify(key ? answers[key] : { error: "nope" }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

describe("fetchCompareSetup (sefaria/views.py compare; values VERIFIED 2026-11-04 against live JSON_PROPS)", () => {
  it("no ref, or not a ref: an empty section", async () => {
    expect(await fetchCompareSetup(null)).toEqual({ secRef: "", refArray: null, nextChapter: null });
    stubApi({ "/api/name/": { is_ref: false } });
    expect(await fetchCompareSetup("Nonsense")).toEqual({ secRef: "", refArray: null, nextChapter: null });
  });
  it("a book: its first section, one table", async () => {
    stubApi({ "/api/name/": { is_ref: true, is_book: true, ref: "Genesis" }, "/api/texts/": { ref: "Genesis 1", sectionRef: "Genesis 1", sections: [1], textDepth: 2, next: "Genesis 2" } });
    expect(await fetchCompareSetup("Genesis")).toEqual({ secRef: "Genesis 1", refArray: null, nextChapter: "Genesis 2" });
  });
  it("a segment: its section, and no table (refArray [])", async () => {
    stubApi({ "/api/name/": { is_ref: true, ref: "Genesis 1:3", sections: ["1", "3"], internalSections: [1, 3] }, "/api/texts/": { ref: "Genesis 1:3", sectionRef: "Genesis 1", sections: [1, 3], textDepth: 2, next: "Genesis 2" } });
    expect(await fetchCompareSetup("Genesis.1.3")).toEqual({ secRef: "Genesis 1", refArray: [], nextChapter: "Genesis 2" });
  });
  it("above section level: one table per ref below, counted from the shape", async () => {
    stubApi({
      "/api/name/": { is_ref: true, ref: "Rashi on Genesis 1", index: "Rashi on Genesis", sections: ["1"], internalSections: [1] },
      "/api/texts/": { ref: "Rashi on Genesis 1:1", sectionRef: "Rashi on Genesis 1:1", sections: [1, 1], textDepth: 3, next: "Rashi on Genesis 1:2" },
      "/api/shape/": [{ title: "Rashi on Genesis", chapters: [[3, 5, 0], [1]] }],
    });
    expect(await fetchCompareSetup("Rashi_on_Genesis.1")).toEqual({ secRef: "Rashi on Genesis 1:1", refArray: ["Rashi on Genesis 1:1", "Rashi on Genesis 1:2", "Rashi on Genesis 1:3"], nextChapter: "Rashi on Genesis 1:2" });
  });
  it("a section range: one table per section (the old page's rows never loaded)", async () => {
    stubApi({ "/api/name/": { is_ref: true, ref: "Genesis 1-2", sections: ["1"] }, "/api/texts/": { ref: "Genesis 1-2", sectionRef: "Genesis 1-2", sections: [1], textDepth: 2, isSpanning: true, spanningRefs: ["Genesis 1", "Genesis 2"], next: "Genesis 3" } });
    expect(await fetchCompareSetup("Genesis.1-2")).toEqual({ secRef: "Genesis 1-2", refArray: ["Genesis 1", "Genesis 2"], nextChapter: "Genesis 3" });
  });
});

describe("helpers", () => {
  it("subrefCount walks the shape by the ref's sections, and picks a complex text's node", () => {
    expect(subrefCount([{ title: "A", chapters: [[1, 2], [3]] }], "A 1", [1])).toBe(2);
    expect(subrefCount([{ title: "B, Intro", chapters: [1] }, { title: "B, Part", chapters: [[1], [1, 1, 1]] }], "B, Part 2", [2])).toBe(3);
  });
  it("versionTitlesFor buckets by a trailing [xx] code, else the version's language (Sefaria._sortVersionsIntoBuckets)", () => {
    const vs = [{ versionTitle: "A", language: "en" }, { versionTitle: "B [fr]", language: "en" }, { versionTitle: "C", language: "he" }];
    expect(versionTitlesFor(vs, "en")).toEqual(["A"]);
    expect(versionTitlesFor(vs, "fr")).toEqual(["B [fr]"]);
    expect(versionTitlesFor(vs, "he")).toEqual(["C"]);
  });
  it("the texts URL carries the old page's parameters", () => {
    expect(normRef("Rashi on Genesis 1:1")).toBe("Rashi_on_Genesis.1.1");
    expect(sectionTextUrl("Genesis 1", "he", "Tanach with Ta'amei Hamikra")).toMatch(/\/api\/texts\/Genesis\.1\?vhe=Tanach_with_Ta%27amei_Hamikra&commentary=0&context=0&pad=0&wrapLinks=0&multiple=0&stripItags=0&transLangPref=&firstAvailableRef=1&fallbackOnDefaultVersion=1$/);
    expect(sectionTextUrl("Genesis 1", "en", "X Y")).toContain("?ven=X_Y&");
  });
});
