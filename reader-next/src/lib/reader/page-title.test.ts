import { describe, expect, it } from "vitest";
import { hebrewRefOf, notFoundTitle, readerPageTitle, sidebarTitlePart } from "./page-title";

// The strings below are www.sefaria.org's document.title, read 2026-11-10 (page-title.ts)
describe("the reader's <title>, as sefaria.org's", () => {
  // @feature PLT-006
  it("a section, in each interface", () => {
    expect(readerPageTitle([{ ref: "Genesis 1", heRef: "בראשית א׳" }], "english")).toBe("Genesis 1 | The Sefaria Library");
    expect(readerPageTitle([{ ref: "Genesis 1", heRef: "בראשית א׳" }], "hebrew")).toBe("בראשית א׳ | האוסף של ספריא");
  });

  it("with a sidebar: its source after 'with', none for Resources or a category's list", () => {
    const p = { ref: "Genesis 1:1", heRef: "בראשית א׳:א" };
    const he = (n: string) => ({ Rashi: 'רש"י', Commentary: "מפרשים" })[n];
    expect(readerPageTitle([{ ...p, view: "Rashi" }], "english")).toBe("Genesis 1:1 with Rashi | The Sefaria Library");
    expect(readerPageTitle([{ ...p, view: "Rashi" }], "hebrew", he)).toBe('בראשית א׳:א עם רש"י | האוסף של ספריא');
    expect(readerPageTitle([{ ...p, view: "Commentary" }], "hebrew", he)).toBe("בראשית א׳:א עם מפרשים | האוסף של ספריא");
    expect(readerPageTitle([{ ...p, view: "Translations" }], "english")).toBe("Genesis 1:1 with Translations | The Sefaria Library");
    expect(readerPageTitle([{ ...p, view: "Translations" }], "hebrew")).toBe("בראשית א׳:א עם תרגומים | האוסף של ספריא");
    expect(readerPageTitle([{ ...p, view: "About" }], "hebrew")).toBe("בראשית א׳:א עם אודות | האוסף של ספריא");
    expect(readerPageTitle([{ ...p, view: "Sheets" }], "hebrew")).toBe("בראשית א׳:א עם דפי מקורות | האוסף של ספריא");
    expect(readerPageTitle([{ ...p, view: "Quoting_Commentary" }], "hebrew")).toBe("בראשית א׳:א עם פרשנות מצטטת | האוסף של ספריא");
    expect(readerPageTitle([{ ...p, view: "Web Pages" }], "english")).toBe("Genesis 1:1 with Web Pages | The Sefaria Library");
    expect(readerPageTitle([{ ...p, view: "all" }], "english")).toBe("Genesis 1:1 | The Sefaria Library");
    expect(readerPageTitle([{ ...p, view: "Rashi ConnectionsList" }], "english")).toBe("Genesis 1:1 | The Sefaria Library");
  });

  it("a name with no Hebrew known stays as written (the old client's fallback)", () => {
    expect(sidebarTitlePart("Some Book", "hebrew")).toBe("Some Book");
  });

  it("two panels: joined by the old 'and', the suffix once (legacy repeated it: not ported)", () => {
    const panels = [{ ref: "Genesis 1", heRef: "בראשית א׳" }, { ref: "Exodus 1", heRef: "שמות א׳" }];
    expect(readerPageTitle(panels, "english")).toBe("Genesis 1 & Exodus 1 | The Sefaria Library");
    expect(readerPageTitle(panels, "hebrew")).toBe("בראשית א׳ | שמות א׳ | האוסף של ספריא");
  });

  it("a Hebrew ref not known falls back to the English one", () => {
    expect(readerPageTitle([{ ref: "Genesis 1:1-2:3" }], "hebrew")).toBe("Genesis 1:1-2:3 | האוסף של ספריא");
  });

  it("not found, as Django's 404", () => {
    expect(notFoundTitle("english")).toBe("Page Not Found | Sefaria");
    expect(notFoundTitle("hebrew")).toBe("הדף שביקשתם איננו נמצא | ספריא");
  });
});

describe("a ref in Hebrew from its loaded sections", () => {
  const genesis1 = [{ ref: "Genesis 1", heRef: "בראשית א׳" }];
  it("a section is the server's name; a segment or range in it, the old client's (unpunctuated numerals)", () => {
    expect(hebrewRefOf("Genesis 1", genesis1)).toBe("בראשית א׳");
    expect(hebrewRefOf("Genesis 1:1", genesis1)).toBe("בראשית א׳:א");
    expect(hebrewRefOf("Genesis 1:15", genesis1)).toBe("בראשית א׳:טו");
    expect(hebrewRefOf("Genesis 1:1-3", genesis1)).toBe("בראשית א׳:א-ג");
    expect(hebrewRefOf("Berakhot 2a:3", [{ ref: "Berakhot 2a", heRef: "ברכות ב׳ א" }])).toBe("ברכות ב׳ א:ג");
  });
  it("anything else is unknown", () => {
    expect(hebrewRefOf("Genesis 1:1-2:3", genesis1)).toBeUndefined();
    expect(hebrewRefOf("Exodus 1:1", genesis1)).toBeUndefined();
    expect(hebrewRefOf("Genesis 1", [])).toBeUndefined();
  });
});
