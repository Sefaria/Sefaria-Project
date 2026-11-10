import { describe, expect, it } from "vitest";
import type { TocNode } from "~/lib/catalog/toc";
import { bookMeta, categoryMeta, libraryHomeMeta, searchMeta } from "./page-head";

const get = (meta: ReturnType<typeof searchMeta>, key: string) =>
  meta.map((m) => ("title" in m ? (key === "title" ? m.title : undefined) : "name" in m ? (m.name === key ? m.content : undefined) : m.property === key ? m.content : undefined)).find((v) => v !== undefined);

const tree = [
  { category: "Tanakh", heCategory: 'תנ"ך', enDesc: "The Tanakh, or Hebrew Bible…", heDesc: 'התנ"ך…', contents: [{ category: "Torah", heCategory: "תורה", enShortDesc: "Five Books of Moses", heDesc: "התורה כוללת…", contents: [] }, { category: "Writings", heCategory: "כתובים", contents: [] }] },
] as unknown as TocNode[];

// VERIFIED on www.sefaria.org / www.sefaria.org.il 2026-11-10 (titles: document.title after load; descriptions: curl) (PLT-006)
describe("the library pages' titles and descriptions, as sefaria.org's", () => {
  it("the home page", () => {
    expect(get(libraryHomeMeta("english"), "title")).toBe("Sefaria: a Living Library of Jewish Texts Online");
    expect(get(libraryHomeMeta("hebrew"), "title")).toBe("ספריא: ספרייה חיה של טקסטים יהודיים");
    expect(get(libraryHomeMeta("english"), "og:description")).toMatch(/^The largest free library of Jewish texts/);
  });
  it("a category: the path's names, then its description, its short description or the default line", () => {
    expect(get(categoryMeta(tree, ["Tanakh", "Torah"], "english")!, "title")).toBe("Tanakh, Torah | The Sefaria Library");
    expect(get(categoryMeta(tree, ["Tanakh", "Torah"], "english")!, "description")).toBe("Five Books of Moses");
    expect(get(categoryMeta(tree, ["Tanakh", "Torah"], "hebrew")!, "title")).toBe('תנ"ך, תורה | האוסף של ספריא');
    expect(get(categoryMeta(tree, ["Tanakh", "Torah"], "hebrew")!, "description")).toBe("התורה כוללת…");
    expect(get(categoryMeta(tree, ["Tanakh", "Writings"], "english")!, "description")).toBe("Read Tanakh, Writings texts online with commentaries and connections.");
    expect(categoryMeta(tree, ["history"], "english")).toBeUndefined();
  });
  it("a book: its description and the Read line (English in both interfaces, as live)", () => {
    const g = { title: "Genesis", heTitle: "בראשית", enDesc: "Genesis is…", heDesc: "ספר בראשית…" };
    expect(get(bookMeta(g, "english"), "title")).toBe("Genesis | The Sefaria Library");
    expect(get(bookMeta(g, "english"), "description")).toBe("Genesis is… Read the text of Genesis online with commentaries and connections.");
    expect(get(bookMeta(g, "hebrew"), "title")).toBe("בראשית | האוסף של ספריא");
    expect(get(bookMeta({ title: "Pesach Haggadah", heTitle: "הגדה של פסח" }, "hebrew"), "description")).toBe("Read the text of הגדה של פסח online with commentaries and connections.");
  });
  it("search: the query, the description, and noindex", () => {
    expect(get(searchMeta("moses", "english"), "title")).toBe("moses | The Sefaria Library");
    expect(get(searchMeta(undefined, "hebrew"), "title")).toBe("חיפוש | האוסף של ספריא");
    expect(get(searchMeta("x", "english"), "robots")).toBe("noindex, nofollow");
  });
});
