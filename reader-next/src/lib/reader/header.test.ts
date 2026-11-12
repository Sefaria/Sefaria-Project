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

// R-TITLE-2: the title is sefaria.org's current ref (@feature TXD-013)
describe("titleVerses", () => {
  const none = { rangeVerses: [] as number[], talmud: false, rangeWithinSection: false, language: "hebrew" as const };
  const genesis1 = { sectionRef: "Genesis 1", heSectionRef: "בראשית א׳" };
  const daf = { sectionRef: "Berakhot 2a", heSectionRef: "ברכות ב׳ א" };
  const title = (i: Parameters<typeof titleVerses>[0], base = genesis1) => narrowToVerses(base, titleVerses(i));
  it("names the address's segment on arrival in Hebrew or English mode (Genesis 1:3, Rashi on Genesis 1:1:1, Berakhot 2a:3)", () => {
    expect(title({ ...none, entrySegment: 3 })).toEqual({ sectionRef: "Genesis 1:3", heSectionRef: "בראשית א׳:ג׳" });
    expect(title({ ...none, language: "english", entrySegment: 1 }, { sectionRef: "Rashi on Genesis 1:1", heSectionRef: 'רש"י על בראשית א׳:א׳' })).toEqual({
      sectionRef: "Rashi on Genesis 1:1:1", heSectionRef: 'רש"י על בראשית א׳:א׳:א׳',
    });
    expect(title({ ...none, talmud: true, entrySegment: 3 }, daf)).toEqual({ sectionRef: "Berakhot 2a:3", heSectionRef: "ברכות ב׳ א:ג׳" });
  });
  it("names the section in bilingual mode, once the reader has moved, or when no segment was named", () => {
    expect(title({ ...none, language: "bilingual", entrySegment: 3 })).toEqual(genesis1);
    expect(title(none)).toEqual(genesis1);
  });
  it("keeps a Torah portion's verses in this section, in every mode", () => {
    for (const language of ["hebrew", "english", "bilingual"] as const)
      expect(titleVerses({ rangeVerses: [9, 10, 22], talmud: false, rangeWithinSection: false, language })).toEqual([9, 10, 22]);
  });
  it("names the daf for a range of lines inside it (Berakhot 2a:3-5 → Berakhot 2a), the range itself in Hebrew mode", () => {
    const range = { rangeVerses: [3, 4, 5], talmud: true, rangeWithinSection: true };
    expect(title({ ...range, language: "english" }, daf)).toEqual(daf);
    expect(title({ ...range, language: "bilingual" }, daf)).toEqual(daf);
    expect(title({ ...range, language: "hebrew" }, daf)).toEqual({ sectionRef: "Berakhot 2a:3-5", heSectionRef: "ברכות ב׳ א:ג׳-ה׳" });
  });
});

// R-SET-8: an English-original work stays in Hebrew mode; its title is in English, the source's language
describe("titleLanguage for an English-only work in Hebrew mode", () => {
  it("is English with either interface", () => {
    for (const interfaceLang of ["english", "hebrew"] as const)
      expect(titleLanguage({ language: "hebrew", interfaceLang, primaryVersion: { languageFamilyName: "english" } })).toBe("en");
  });
});
