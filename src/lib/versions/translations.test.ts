import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { allTranslationsQueryOptions, bucketLanguage, bucketTranslations, currentFirst, languageName, licenseUrl, orderLanguages, previewHtml, type TranslationVersion } from "./translations";

const v = (versionTitle: string, language = "en"): TranslationVersion => ({ versionTitle, language, languageFamilyName: "english", text: "" });

// @feature VER-009 @feature VER-010 @feature VER-011
describe("translations sidebar data (old TranslationsBox rules, verified on sefaria.org)", () => {
  it("takes the language from a [xx] title suffix, else the version's language", () => {
    expect(bucketLanguage(v("Die fünf Bücher Moses [de]"))).toBe("de");
    expect(bucketLanguage(v("The Koren Jerusalem Bible"))).toBe("en");
    expect(bucketLanguage(v("Ladino [lad]", "he"))).toBe("lad");
  });
  it("orders languages by code with English first", () => {
    expect(orderLanguages(["es", "de", "en", "eo", "fr"])).toEqual(["en", "de", "eo", "es", "fr"]);
  });
  it("puts the current translation first in its language, never reordering Hebrew", () => {
    const b = [v("A"), v("B"), v("C")];
    expect(currentFirst(b, "en", "C").map((x) => x.versionTitle)).toEqual(["C", "A", "B"]);
    expect(currentFirst(b, "he", "C").map((x) => x.versionTitle)).toEqual(["A", "B", "C"]);
  });
  it("joins a passage's segments for the preview", () => {
    expect(previewHtml(["In the beginning", ["God", "created"]])).toBe("In the beginning God created");
    expect(previewHtml(undefined)).toBe("");
  });
  it("links licenses like the old site", () => {
    expect(licenseUrl("CC-BY-NC")).toBe("https://creativecommons.org/licenses/by-nc/4.0/");
    expect(licenseUrl("Copyright")).toBeUndefined();
  });
  it("names languages in the interface language", () => {
    expect(languageName("de", "english")).toBe("German");
    expect(languageName("de", "hebrew")).toBe("גרמנית");
  });
  it("Genesis 1:1 (recorded): English (14) first, as on sefaria.org", async () => {
    const qc = makeQueryClient();
    const all = await qc.fetchQuery(allTranslationsQueryOptions("Genesis 1:1"));
    const buckets = bucketTranslations(all);
    expect(orderLanguages(Object.keys(buckets))[0]).toBe("en");
    expect(buckets.en).toHaveLength(14);
    expect(buckets.de).toHaveLength(3);
  });
});
