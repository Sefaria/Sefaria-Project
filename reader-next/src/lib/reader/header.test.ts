import { describe, expect, it } from "vitest";
import { categoryAttribution, headerLabels, type HeaderInput } from "./header";

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
