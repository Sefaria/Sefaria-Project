import { describe, expect, it } from "vitest";
import { categoryAttribution, headerLabels, type HeaderInput, narrowToVerses, titleLanguage, titleVerses } from "./header";

const genesis: HeaderInput = {
  sectionRef: "Genesis 1", heSectionRef: "בראשית א׳", categories: ["Tanakh", "Torah"],
  translationVersion: { versionTitle: "THE JPS TANAKH: Gender-Sensitive Edition", shortVersionTitle: "Revised JPS, 2023", languageFamilyName: "english" },
  primaryVersion: { languageFamilyName: "hebrew" },
  language: "english", interfaceLang: "english",
};
const berakhot: HeaderInput = {
  sectionRef: "Berakhot 2a", heSectionRef: "ברכות ב׳ א", categories: ["Talmud", "Bavli", "Seder Zeraim"],
  translationVersion: { versionTitle: "William Davidson Edition - English", shortVersionTitle: "Koren - Steinsaltz", languageFamilyName: "english" },
  primaryVersion: { languageFamilyName: "hebrew" },
  language: "english", interfaceLang: "english",
};

// @feature TXD-013 @feature VER-005 @feature TXT-009
describe("header labels (verified on sefaria.org)", () => {
  it("English: English title and the translation's short name", () => {
    expect(headerLabels(genesis)).toEqual({ lang: "en", title: "Genesis 1", version: "Revised JPS, 2023" });
  });
  it("Hebrew-only: Hebrew title and no version label", () => {
    expect(headerLabels({ ...genesis, language: "hebrew" })).toEqual({ lang: "he", title: "בראשית א׳" });
  });
  it("bilingual: the interface language decides the title; the version still shows", () => {
    expect(headerLabels({ ...genesis, language: "bilingual" }).title).toBe("Genesis 1");
    const he = headerLabels({ ...genesis, language: "bilingual", interfaceLang: "hebrew" });
    expect(he.title).toBe("בראשית א׳");
    expect(he.version).toBe("Revised JPS, 2023");
  });
  it("English mode, but the 'translation' is Hebrew (Zohar): a Hebrew title, and the version still shows", () => {
    const zohar = { ...genesis, sectionRef: "Zohar, Bereshit 1", heSectionRef: "ספר הזהר, בראשית א׳", categories: ["Kabbalah", "Zohar"], translationVersion: { versionTitle: "Hebrew Translation", languageFamilyName: "hebrew" } };
    expect(headerLabels(zohar)).toEqual({ lang: "he", title: "ספר הזהר, בראשית א׳", version: "Hebrew Translation" });
    expect(headerLabels({ ...zohar, language: "bilingual" }).title).toBe("Zohar, Bereshit 1"); // bilingual: the interface language
  });
  it("English mode with a translation in another language (French): the interface language decides", () => {
    const fr = { ...genesis, translationVersion: { versionTitle: "La Bible", languageFamilyName: "french" } };
    expect(headerLabels(fr).title).toBe("Genesis 1");
    expect(headerLabels({ ...fr, interfaceLang: "hebrew" }).title).toBe("בראשית א׳");
  });
  it("falls back to the full version title when there is no short one", () => {
    expect(headerLabels({ ...genesis, translationVersion: { versionTitle: "The Koren Jerusalem Bible", languageFamilyName: "english" } }).version).toBe("The Koren Jerusalem Bible");
  });
  it("no translation, no version label", () => {
    expect(headerLabels({ ...genesis, translationVersion: undefined }).version).toBeUndefined();
  });
  it("Talmud: William Davidson attribution in every mode; the version is parenthesised under it", () => {
    expect(headerLabels(berakhot)).toEqual({ lang: "en", title: "Berakhot 2a", attribution: { text: "The William Davidson Talmud", link: "/william-davidson-talmud" }, version: "(Koren - Steinsaltz)" });
    expect(headerLabels({ ...berakhot, language: "hebrew" })).toEqual({ lang: "he", title: "ברכות ב׳ א", attribution: { text: "תלמוד מהדורת ויליאם דוידסון", link: "/william-davidson-talmud" } });
  });
  it("attribution applies to the Bavli only", () => {
    expect(categoryAttribution(["Talmud", "Yerushalmi"])).toBeUndefined();
    expect(categoryAttribution(["Mishnah", "Seder Zeraim"])).toBeUndefined();
    expect(categoryAttribution(["Talmud"])).toBeUndefined();
    expect(categoryAttribution(undefined)).toBeUndefined();
  });
});

// @feature TXD-013 @feature TXT-002
describe("narrowToVerses", () => {
  const base = { sectionRef: "Genesis 6", heSectionRef: "בראשית ו׳" };
  it("names the kept range's verses in this section", () => {
    expect(narrowToVerses(base, [9, 10, 22])).toEqual({ sectionRef: "Genesis 6:9-22", heSectionRef: "בראשית ו׳:ט׳-כ״ב" });
    expect(narrowToVerses(base, [9])).toEqual({ sectionRef: "Genesis 6:9", heSectionRef: "בראשית ו׳:ט׳" });
  });
  it("leaves the section alone when none of it is in the range", () => expect(narrowToVerses(base, [])).toBe(base));
});

// The title names the panel's current ref: the address as written on arrival, until the reader scrolls (@feature TXD-013)
describe("titleVerses", () => {
  const genesis1 = { sectionRef: "Genesis 1", heSectionRef: "בראשית א׳" };
  const daf = { sectionRef: "Berakhot 2a", heSectionRef: "ברכות ב׳ א" };
  const title = (i: Parameters<typeof titleVerses>[0], base = genesis1, sep: ":" | " " = ":") => narrowToVerses(base, titleVerses(i), sep);
  const arrived = (arrivalVerses: number[]) => ({ moved: false, arrivalVerses });
  it("names the address's segment on arrival (Genesis 1:3, Rashi on Genesis 1:1:1, Berakhot 2a:3)", () => {
    expect(title(arrived([3]))).toEqual({ sectionRef: "Genesis 1:3", heSectionRef: "בראשית א׳:ג׳" });
    expect(title(arrived([1]), { sectionRef: "Rashi on Genesis 1:1", heSectionRef: 'רש"י על בראשית א׳:א׳' })).toEqual({
      sectionRef: "Rashi on Genesis 1:1:1", heSectionRef: 'רש"י על בראשית א׳:א׳:א׳',
    });
    expect(title(arrived([3]), daf)).toEqual({ sectionRef: "Berakhot 2a:3", heSectionRef: "ברכות ב׳ א:ג׳" });
  });
  it("names an arrival range's verses in this section: a daf's lines, a Torah portion's verses", () => {
    expect(title(arrived([3, 4, 5]), daf)).toEqual({ sectionRef: "Berakhot 2a:3-5", heSectionRef: "ברכות ב׳ א:ג׳-ה׳" });
    expect(title(arrived([9, 10, 22]), { sectionRef: "Genesis 6", heSectionRef: "בראשית ו׳" })).toEqual({ sectionRef: "Genesis 6:9-22", heSectionRef: "בראשית ו׳:ט׳-כ״ב" });
  });
  it("names a segment range as written even when it covers the whole section (Genesis 1:1-31)", () => {
    expect(title(arrived(Array.from({ length: 31 }, (_, k) => k + 1))).sectionRef).toBe("Genesis 1:1-31");
  });
  it("names the section for an address of whole sections (Genesis 1, Genesis 1-2, Rashi on Genesis 1:1-3)", () => {
    expect(title(arrived([]))).toEqual(genesis1);
  });
  it("names the section once the reader has scrolled, whatever the address named", () => {
    expect(title({ moved: true, arrivalVerses: [3] })).toEqual(genesis1);
    expect(title({ moved: true, arrivalVerses: [9, 22] })).toEqual(genesis1);
  });
});

describe("narrowToVerses separator", () => {
  it("a named section takes a space (Pesach Haggadah, Magid, The Four Sons 2)", () => {
    expect(narrowToVerses({ sectionRef: "Pesach Haggadah, Magid, The Four Sons", heSectionRef: "הגדה של פסח, מגיד, כנגד ארבעה בנים" }, [2], " ")).toEqual({
      sectionRef: "Pesach Haggadah, Magid, The Four Sons 2", heSectionRef: "הגדה של פסח, מגיד, כנגד ארבעה בנים ב׳",
    });
  });
  it("a numbered section of a complex book takes a colon (Mishneh Torah, Shulchan Arukh)", () => {
    expect(narrowToVerses({ sectionRef: "Mishneh Torah, Repentance 1", heSectionRef: "משנה תורה, הלכות תשובה א׳" }, [3]).sectionRef).toBe("Mishneh Torah, Repentance 1:3");
    expect(narrowToVerses({ sectionRef: "Shulchan Arukh, Orach Chayim 1", heSectionRef: "שולחן ערוך, אורח חיים א׳" }, [2]).heSectionRef).toBe("שולחן ערוך, אורח חיים א׳:ב׳");
  });
});

// An English-original work asked for in Hebrew: its title is in English, the source's language
describe("titleLanguage for an English-only work in Hebrew mode", () => {
  it("is English with either interface", () => {
    for (const interfaceLang of ["english", "hebrew"] as const)
      expect(titleLanguage({ language: "hebrew", interfaceLang, primaryVersion: { languageFamilyName: "english" } })).toBe("en");
  });
});
