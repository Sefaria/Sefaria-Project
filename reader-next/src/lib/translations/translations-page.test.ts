import { afterEach, describe, expect, it, vi } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import type { TocNode } from "~/lib/catalog/toc";
import { parseDataJsTerms } from "./terms";
import {
  ABOUT_TRANSLATED_TEXT,
  IN_APP_TRANSLATION_LANGUAGES,
  TRANSLATION_LANGUAGES,
  buildTranslationsPage,
  clearSharedTranslationsModels,
  isTranslationSlug,
  sharedTranslationsModel,
  translationLanguage,
  type RawTranslations,
  type TranslationsPageModel,
} from "./translations-page";

const tree = readFixture<TocNode[]>("_toc/toc.json");
const de = readFixture<RawTranslations>("_translations/de.json");
const en = readFixture<RawTranslations>("_translations/en.json");
const ar = readFixture<RawTranslations>("_translations/ar.json");

// @feature RTE-011 @feature LIB-021
describe("which languages have a page", () => {
  it("exactly Django's title_dictionary: ar de en eo es fa fi fr he it pl pt ru yi", () => {
    expect(Object.keys(TRANSLATION_LANGUAGES)).toEqual(["ar", "de", "en", "eo", "es", "fa", "fi", "fr", "he", "it", "pl", "pt", "ru", "yi"]);
    for (const s of Object.keys(TRANSLATION_LANGUAGES)) expect(isTranslationSlug(s)).toBe(true);
  });
  it("the sidebar's ro and tr, Ladino, an upper-case code and an unknown one are 404s (as on sefaria.org)", () => {
    for (const s of ["ro", "tr", "lad", "DE", "xx", "", "toString", "__proto__"]) expect(isTranslationSlug(s)).toBe(false);
  });
  // @feature LIB-037
  it("ro and tr (the sidebar's Română and Türkçe), lad and jrb open only inside the app, titled as Sefaria.getHebrewTitle", () => {
    expect(translationLanguage("tr", false)).toBeUndefined();
    expect(translationLanguage("ro", false)).toBeUndefined();
    expect(translationLanguage("tr", true)!.title).toBe("Türkçe Yahudi Metinleri");
    expect(translationLanguage("ro", true)!.title).toBe("Texte evreiești în limba română");
    expect(translationLanguage("lad", true)!.title).toBe("Jewish Texts in Ladino");
    expect(translationLanguage("de", false)).toBe(TRANSLATION_LANGUAGES.de);
    for (const s of ["xx", "DE", "TR", "__proto__", "toString"]) expect(translationLanguage(s, true), s).toBeUndefined();
    for (const s of Object.keys(IN_APP_TRANSLATION_LANGUAGES)) expect(isTranslationSlug(s)).toBe(false);
  });
  it("the About module is in every language but English and Hebrew", () => {
    expect(Object.keys(ABOUT_TRANSLATED_TEXT).sort()).toEqual(Object.keys(TRANSLATION_LANGUAGES).filter((s) => s !== "en" && s !== "he").sort());
  });
});

// @feature LIB-020
describe("buildTranslationsPage", () => {
  it("German: corpora in library order, sub-categories in catalog order, the corpus's own texts first", () => {
    const m = buildTranslationsPage(tree, de, "de");
    expect(m.sections.map((s) => s.corpus.en)).toEqual(["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Jewish Thought"]);
    const tanakh = m.sections[0]!;
    expect(tanakh.prioritized).toBeNull();
    expect(tanakh.groups.map((g) => g.category.en)).toEqual(["Torah", "Prophets", "Writings", "Rishonim on Tanakh", "Acharonim on Tanakh"]);
    expect(tanakh.groups[0]!.items.map((i) => i.title.en)).toEqual(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]);
    expect(tanakh.groups[0]!.items[0]!.url).toBe("/Genesis.1?ven=german%7CDie+f%C3%BCnf+B%C3%BCcher+Moses%2C+trans.+Dr.+J.+Wohlgemuth%2C+R%C3%B6delheim+1899+%5Bde%5D&lang=bi");
    const halakhah = m.sections.find((s) => s.corpus.en === "Halakhah")!;
    expect(halakhah.prioritized!.map((i) => i.title.en)).toEqual(["Kitzur Shulchan Arukh"]);
    expect(halakhah.uncategorized).toEqual([]);
  });
  it("Hebrew names from the catalog: corpus, sub-category and text", () => {
    const m = buildTranslationsPage(tree, de, "de");
    expect(m.sections[0]!.corpus.he).toBe('תנ"ך');
    expect(m.sections[0]!.groups[0]!.category.he).toBe("תורה");
    expect(m.sections[0]!.groups[0]!.items[0]!.title.he).toBe("בראשית");
  });
  it("the terms dictionary comes first, as the old hebrewTerm (Exodus is 'ספר שמות' in the Hebrew interface on sefaria.org)", () => {
    const m = buildTranslationsPage(tree, de, "de", { Exodus: { en: "Exodus", he: "ספר שמות" }, Torah: { he: "תורה!" } });
    expect(m.sections[0]!.groups[0]!.items.map((i) => i.title.he).slice(0, 2)).toEqual(["בראשית", "ספר שמות"]);
    expect(m.sections[0]!.groups[0]!.category.he).toBe("תורה!");
  });
  it("English: bundled commentaries link to their category page and take its Hebrew name", () => {
    const m = buildTranslationsPage(tree, en, "en");
    const rishonim = m.sections[0]!.groups.find((g) => g.category.en === "Rishonim on Tanakh")!;
    expect(rishonim.items[0]).toEqual({ title: { en: "Rashi", he: 'רש"י' }, url: "/texts/Tanakh/Rishonim on Tanakh/Rashi" });
  });
  it("sorted by the first number of order when both texts have one, otherwise kept as they came", () => {
    const raw: RawTranslations = { Tanakh: { Torah: [{ title: "Exodus", url: "/e", order: [2] }, { title: "X", url: "/x" }, { title: "Genesis", url: "/g", order: [1] }] } };
    expect(buildTranslationsPage(tree, raw, "xx").sections[0]!.groups[0]!.items.map((i) => i.title.en)).toEqual(["Exodus", "X", "Genesis"]);
    const raw2: RawTranslations = { Tanakh: { Torah: [{ title: "Exodus", url: "/e", order: [2] }, { title: "Genesis", url: "/g", order: [1] }] } };
    expect(buildTranslationsPage(tree, raw2, "xx").sections[0]!.groups[0]!.items.map((i) => i.title.en)).toEqual(["Genesis", "Exodus"]);
  });
  it("Uncategorized: texts the catalog lists at the corpus's top first; the rest in their own block, titles in English only", () => {
    const raw: RawTranslations = { Halakhah: { Uncategorized: [{ title: "Not A Real Book", url: "/n" }, { title: "Kitzur Shulchan Arukh", url: "/k" }] } };
    const s = buildTranslationsPage(tree, raw, "xx").sections[0]!;
    expect(s.prioritized!.map((i) => i.title.en)).toEqual(["Kitzur Shulchan Arukh"]);
    expect(s.uncategorized).toEqual([{ title: { en: "Not A Real Book", he: "Not A Real Book" }, url: "/n" }]);
    expect(s.groups).toEqual([]);
  });
  it("a corpus or sub-category the catalog does not have is not shown", () => {
    const raw: RawTranslations = { Nowhere: { X: [{ title: "a", url: "/a" }] }, Tanakh: { Nowhere: [{ title: "b", url: "/b" }] } };
    const m = buildTranslationsPage(tree, raw, "xx");
    expect(m.sections.map((s) => s.corpus.en)).toEqual(["Tanakh"]);
    expect(m.sections[0]!.groups).toEqual([]);
  });
  it("Arabic: two corpora, Pirkei Avot under Seder Nezikin", () => {
    const m = buildTranslationsPage(tree, ar, "ar");
    expect(m.sections.map((s) => s.corpus.en)).toEqual(["Mishnah", "Jewish Thought"]);
    expect(m.sections[0]!.groups[0]!.items[0]!.title.en).toBe("Pirkei Avot");
  });
});

describe("parseDataJsTerms", () => {
  it("reads the terms line of /data.js", () => {
    const js = 'var DJANGO_DATA_VARS = {\n  _dataLoaded:          true,\n  terms:                {"Exodus": {"en": "Exodus", "he": "ספר שמות"}},\n  books: [],\n};';
    expect(parseDataJsTerms(js)).toEqual({ Exodus: { en: "Exodus", he: "ספר שמות" } });
    expect(parseDataJsTerms("nothing here")).toBeNull();
  });
});

// @feature LIB-021
describe("sharedTranslationsModel (the server's copy of a page's model)", () => {
  afterEach(() => clearSharedTranslationsModels());
  const model = (slug: string): TranslationsPageModel => ({ slug, sections: [] });
  it("one upstream call per language; a request during a call joins it", async () => {
    const load = vi.fn(async (slug: string) => model(slug));
    const [a, b] = [sharedTranslationsModel("de", load, 0), sharedTranslationsModel("de", load, 10)];
    expect(await a).toBe(await b);
    await sharedTranslationsModel("fr", load, 20);
    expect(load.mock.calls.map((c) => c[0])).toEqual(["de", "fr"]);
  });
  it("a failure is kept for a minute (the post-hydration ask fails fast), then tried again; a model for ten minutes", async () => {
    let fail = true;
    const load = vi.fn(async (slug: string) => {
      if (fail) throw new Error("500");
      return model(slug);
    });
    const t0 = Date.now();
    await expect(sharedTranslationsModel("he", load, t0)).rejects.toThrow("500");
    await expect(sharedTranslationsModel("he", load, t0 + 30_000)).rejects.toThrow("500");
    expect(load).toHaveBeenCalledTimes(1);
    fail = false;
    await expect(sharedTranslationsModel("he", load, t0 + 61_000 + 1000)).resolves.toEqual(model("he"));
    expect(load).toHaveBeenCalledTimes(2);
    await sharedTranslationsModel("he", load, t0 + 5 * 60_000);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
