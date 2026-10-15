import { describe, expect, it } from "vitest";
import { adaptDictaHits, dictaSearchBody, filteredTotal, isDictaQuery, mergeBuckets, mergeHits, reformatDictaRef, scoreSefariaHits, type ScoredHit } from "./dicta";
import { isHebrewText } from "./hebrew";
import { countLabel } from "./search-page";

const DICTA_HIT = { xmlId: "Tanakh.Torah.Genesis.1.14", hebrewPath: 'תנ"ך/תורה/ספר בראשית/פרק א/פסוק יד', pagerank: 40152.49, highlight: [{ text: "יְהִ֤י <b>מְאֹרֹת֙</b>" }] };
const sef = (ref: string, score: number, cats: string[], comp = 500): ScoredHit =>
  scoreSefariaHits([{ _id: ref, _score: score, _source: { ref, heRef: ref, version: "v", lang: "he", languageFamilyName: "hebrew", isPrimary: true, categories: cats, comp_date: comp } }])[0]!;

// @feature SRC-082
describe("Dicta merge (ported from the old search.js)", () => {
  it("asks Dicta only for a mostly-Hebrew query with All Results", () => {
    expect(isDictaQuery("אור", false)).toBe(true);
    expect(isDictaQuery("אור", true)).toBe(false);
    expect(isDictaQuery("light", false)).toBe(false);
    expect(isHebrewText("שמע ישראל 1:1")).toBe(true);
    expect(isHebrewText("Rashi רש״י on")).toBe(false);
  });
  it("the request body: filters as dotted book ids, pagerank or corpus order", () => {
    expect(dictaSearchBody("אור", { from: 100, size: 100, filters: ["Tanakh/Torah/Genesis"], sort: "chronological" })).toEqual({
      query: "אור", from: 100, size: 100, limitedToBooks: ["Tanakh.Torah.Genesis"], sort: "corpus_order_path", smallUnitsOnly: true,
    });
    expect(dictaSearchBody("אור", { from: 0, size: 100, filters: [], sort: "relevance" }).limitedToBooks).toBe(false);
  });
  it("a verse becomes a hit in 'Tanach with Ta'amei Hamikra' with Sefaria's Hebrew ref", () => {
    const [h] = adaptDictaHits([DICTA_HIT], 0);
    expect(h!._source.ref).toBe("Genesis 1:14");
    expect(h!._source.heRef).toBe('בראשית א\':י"ד');
    expect(h!._source.version).toBe("Tanach with Ta'amei Hamikra");
    expect(h!._id).toBe("Genesis 1:14 (Tanach with Ta'amei Hamikra [he])");
    expect(h!.score).toBeCloseTo(-40152.49);
    expect(h!.comp_date).toBe(-10000);
    expect(reformatDictaRef('תנ"ך/נביאים/ספר זכריה/פרק א/פסוק א')).toBe("זכריה א':א'");
  });
  it("Sefaria's Tanakh hits give way to Dicta's; relevance mixes the two after rescaling; chronological puts Dicta first", () => {
    const s = [sef("Berakhot 2a:1", 30, ["Talmud"]), sef("Genesis 1:3", 25, ["Tanakh", "Torah"]), sef("Zohar 1:1", 10, ["Kabbalah"])];
    const d = adaptDictaHits([DICTA_HIT, { ...DICTA_HIT, xmlId: "Tanakh.Torah.Genesis.1.3", pagerank: 100 }]);
    const rel = mergeHits(s, d, "relevance").map((h) => h._source.ref);
    expect(rel).not.toContain("Genesis 1:3" + "x");
    expect(rel.filter((r) => r === "Genesis 1:3")).toHaveLength(1); // only Dicta's
    expect(rel).toHaveLength(4);
    expect(mergeHits(s, d, "chronological").slice(0, 2).map((h) => h._source.ref)).toEqual(["Genesis 1:14", "Genesis 1:3"]);
  });
  it("buckets: Sefaria's Tanakh counts replaced by Dicta's; a filtered total sums the merged buckets", () => {
    const b = mergeBuckets([{ key: "Tanakh/Torah/Genesis", doc_count: 50 }, { key: "Talmud/Bavli/Berakhot", doc_count: 7 }], [{ key: "Tanakh/Torah/Genesis", doc_count: 12 }]);
    expect(b).toEqual([{ key: "Talmud/Bavli/Berakhot", doc_count: 7 }, { key: "Tanakh/Torah/Genesis", doc_count: 12 }]);
    expect(filteredTotal(b, ["Tanakh"])).toBe(12);
    expect(filteredTotal(b, ["Talmud/Bavli"])).toBe(7);
  });
  it("totals read like the old SearchTotal: '10,182+' when capped", () => {
    expect(countLabel(10182, "gte")).toBe("10,182+");
    expect(countLabel(182, "eq")).toBe("182");
  });
});
