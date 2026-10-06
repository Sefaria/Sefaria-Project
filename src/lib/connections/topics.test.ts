import { describe, expect, it } from "vitest";
import related from "../../../fixtures/api/genesis-1/related.json";
import { groupByRef, type RelatedTopic } from "./related";
import { localizedRef, topicSourceNote, topicsForRefs } from "./topics";

const byRef = groupByRef(related.topics as unknown as RelatedTopic[]);

// @feature CON-046
describe("topics for a passage (Genesis 1:1; compared with sefaria.org)", () => {
  it("each topic once, most prominent first", () => {
    const t = topicsForRefs(byRef, ["Genesis 1:1"]);
    expect(t.map((x) => x.title.en)).toEqual(["Creation", "\"In the Beginning of\"", "Heavens", "Creation of Heavens and Earth", "Parashat Bereshit", "Earth", "Ai"]);
    expect(t).toHaveLength(7); // the Resources row says Topics (7)
  });
  it("collects every source that connected a topic", () => {
    const creation = topicsForRefs(byRef, ["Genesis 1:1"])[0]!;
    expect(creation.sources.map((s) => s.en)).toContain("Curation of the Sefaria Learning Team");
    expect(creation.sources.length).toBe(3);
    expect(creation.description?.en).toMatch(/^The opening two \[chapters\]/);
  });
  it("several selected refs: each topic once", () => {
    const both = topicsForRefs(byRef, ["Genesis 1:1", "Genesis 1:2"]);
    expect(new Set(both.map((x) => x.slug)).size).toBe(both.length);
  });
  it("nothing for a ref without topics", () => {
    expect(topicsForRefs(byRef, ["Genesis 1:99"])).toEqual([]);
    expect(topicsForRefs(undefined, ["Genesis 1:1"])).toEqual([]);
  });
  it("the old tooltip text, in both languages", () => {
    expect(topicSourceNote([{ en: "A", he: "א" }, { en: "B", he: "ב" }], "Genesis 1:1", "en")).toBe('This topic is connected to "Genesis 1:1" by A & B.');
    expect(topicSourceNote([{ en: "A", he: "א" }], "בראשית א׳:א׳", "he")).toBe('נושא הזה קשור ל-"בראשית א׳:א׳" על ידי א.');
    expect(topicSourceNote([], "x", "en")).toBe("");
  });
  it("a verse ref in Hebrew", () => {
    const section = { sectionRef: "Genesis 1", heSectionRef: "בראשית א׳" };
    expect(localizedRef("Genesis 1:1", section, "he")).toBe("בראשית א׳:א׳");
    expect(localizedRef("Genesis 1:11", section, "he")).toBe("בראשית א׳:י״א");
    expect(localizedRef("Genesis 1:1", section, "en")).toBe("Genesis 1:1");
    expect(localizedRef("Exodus 2:3", section, "he")).toBe("Exodus 2:3");
  });
});
