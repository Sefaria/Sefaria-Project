import { describe, expect, it } from "vitest";
import { hebrewAddress, laterHebrewSectionRef, sectionHeading, type SectionHeadingInput } from "./section-heading";

// Inputs are the API's own fields (www.sefaria.org /api/texts, 2026-11-10); the expected strings are what sefaria.org prints above
// the section (read from its `.textRange.basetext .title` on the same day, English and Hebrew interface).
const simple = (o: Partial<SectionHeadingInput>): SectionHeadingInput => ({
  primaryCategory: "Tanakh", sectionRef: "", indexTitle: "", heIndexTitle: "", book: "", isComplex: false, sectionNames: ["Chapter", "Verse"], sections: [], addressTypes: ["Perek", "Pasuk"], ...o,
});

// @feature TXD-011 @feature TXD-012
describe("sectionHeading", () => {
  it("Tanakh: the chapter number", () => {
    expect(sectionHeading(simple({ sectionRef: "Psalms 23", heSectionRef: "תהילים כ״ג", indexTitle: "Psalms", heIndexTitle: "תהילים", book: "Psalms", sections: ["23"] }))).toEqual({ en: "23", he: "כ״ג" });
  });
  it("Talmud: the daf as sefaria.org writes it in Hebrew, ב׳ א (not ב.)", () => {
    const daf = (sections: string[], heSectionRef?: string) =>
      sectionHeading(simple({ primaryCategory: "Talmud", sectionRef: `Berakhot ${sections[0]}`, heSectionRef, indexTitle: "Berakhot", heIndexTitle: "ברכות", book: "Berakhot", sectionNames: ["Daf", "Line"], sections, addressTypes: ["Talmud", "Integer"] }));
    expect(daf(["2a"], "ברכות ב׳ א")).toEqual({ en: "2a", he: "ב׳ א" });
    expect(daf(["2b"], "ברכות ב׳ ב")).toEqual({ en: "2b", he: "ב׳ ב" });
    // a later section of a spanning passage has no Hebrew ref of its own: built from the address the same way
    expect(daf(["14b"])).toEqual({ en: "14b", he: "י״ד ב" });
  });
  it("Commentary: the verse address", () => {
    expect(sectionHeading(simple({ primaryCategory: "Commentary", sectionRef: "Rashi on Genesis 1:1", heSectionRef: "רש״י על בראשית א׳:א׳", indexTitle: "Rashi on Genesis", heIndexTitle: "רש״י על בראשית", book: "Rashi on Genesis", sections: ["1", "1"] }))).toEqual({ en: "1:1", he: "א׳:א׳" });
  });
  it("a simple book outside those categories: section name and number (Hebrew: the number)", () => {
    expect(sectionHeading(simple({ primaryCategory: "Halakhah", sectionRef: "Mishneh Torah, Foundations of the Torah 1", heSectionRef: "משנה תורה, הלכות יסודי התורה א׳", indexTitle: "Mishneh Torah, Foundations of the Torah", heIndexTitle: "משנה תורה, הלכות יסודי התורה", book: "Mishneh Torah, Foundations of the Torah", sectionNames: ["Chapter", "Halakhah"], sections: ["1"] }))).toEqual({ en: "Chapter 1", he: "א׳" });
    expect(sectionHeading(simple({ primaryCategory: "Halakhah", sectionRef: "Shulchan Arukh, Orach Chayim 1", heSectionRef: "שולחן ערוך, אורח חיים א׳", indexTitle: "Shulchan Arukh, Orach Chayim", heIndexTitle: "שולחן ערוך, אורח חיים", book: "Shulchan Arukh, Orach Chayim", sectionNames: ["Siman", "Seif"], sections: ["1"] }))).toEqual({ en: "Siman 1", he: "א׳" });
  });
  it("a complex book: its nodes without the book's title, then the section (Zohar, Guide for the Perplexed)", () => {
    expect(sectionHeading(simple({ primaryCategory: "Kabbalah", sectionRef: "Zohar, Bereshit 1", heSectionRef: "ספר הזהר, בראשית א׳", indexTitle: "Zohar", heIndexTitle: "ספר הזהר", book: "Zohar, Bereshit", isComplex: true, sectionNames: ["Chapter", "Paragraph"], sections: ["1"], addressTypes: ["Integer", "Integer"] }))).toEqual({ en: "Bereshit, Chapter 1", he: "בראשית, א׳" });
    expect(sectionHeading(simple({ primaryCategory: "Jewish Thought", sectionRef: "Guide for the Perplexed, Part 1 1", heSectionRef: "מורה נבוכים, חלק א' א׳", indexTitle: "Guide for the Perplexed", heIndexTitle: "מורה נבוכים", book: "Guide for the Perplexed, Part 1", isComplex: true, sectionNames: ["Chapter", "Paragraph"], sections: ["1"], addressTypes: ["Integer", "Integer"] }))).toEqual({ en: "Part 1, Chapter 1", he: "חלק א', א׳" });
  });
  it("a complex book's leaf with no numbers: its nodes (Siddur), never the book's title again", () => {
    expect(sectionHeading(simple({ primaryCategory: "Liturgy", sectionRef: "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani", heSectionRef: "סידור אשכנז, ימי חול, תפילת שחרית, הכנה לתפילה, מודה אני", indexTitle: "Siddur Ashkenaz", heIndexTitle: "סידור אשכנז", book: "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani", isComplex: true, sectionNames: ["Paragraph"], sections: [], addressTypes: ["Integer"] }))).toEqual({
      en: "Weekday, Shacharit, Preparatory Prayers, Modeh Ani",
      he: "ימי חול, תפילת שחרית, הכנה לתפילה, מודה אני",
    });
  });
});

describe("hebrewAddress", () => {
  it("writes a daf and a folio with the amud letter, numbers with geresh", () => {
    expect(hebrewAddress("2a", "Talmud")).toBe("ב׳ א");
    expect(hebrewAddress("3d", "Folio")).toBe("ג׳ ד");
    expect(hebrewAddress("15", "Integer")).toBe("ט״ו");
  });
});

// www.sefaria.org /Zohar%2C_Bereshit.1.5-2.3?lang=he prints "בראשית, ב׳" above the second section
describe("a later section of a range across sections", () => {
  it("keeps a complex book's node names in Hebrew (Zohar 1:5-2:3)", () => {
    const heSectionRef = laterHebrewSectionRef({ heSectionRef: "ספר הזהר, בראשית א׳", sections: ["1"] }, ["2"], ["Integer", "Integer"], "ספר הזהר");
    expect(heSectionRef).toBe("ספר הזהר, בראשית ב׳");
    expect(sectionHeading(simple({ primaryCategory: "Kabbalah", sectionRef: "Zohar, Bereshit 2", heSectionRef, indexTitle: "Zohar", heIndexTitle: "ספר הזהר", book: "Zohar, Bereshit", isComplex: true, sectionNames: ["Chapter", "Paragraph"], sections: ["2"], addressTypes: ["Integer", "Integer"] })).he).toBe("בראשית, ב׳");
  });
  it("swaps a daf for a daf (Berakhot 2a-2b)", () => {
    expect(laterHebrewSectionRef({ heSectionRef: "ברכות ב׳ א", sections: ["2a"] }, ["2b"], ["Talmud", "Integer"], "ברכות")).toBe("ברכות ב׳ ב");
  });
  it("falls back to the book's Hebrew title when the first ref does not end in its numbers", () => {
    expect(laterHebrewSectionRef({ heSectionRef: "משהו אחר", sections: ["1"] }, ["2"], ["Integer"], "ספר")).toBe("ספר ב׳");
  });
});
