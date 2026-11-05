import { describe, expect, it } from "vitest";
import type { VersionMeta } from "~/lib/text/model";
import { CORPUS_COOKIE, formatCorpusCookie, hasVersionPrefs, LANGUAGE_COOKIE, NO_PREFS, parseVersionPrefs, resolveTranslation, withVersionPreference } from "./preferences";

const v = (versionTitle: string, extra: Partial<VersionMeta> = {}): VersionMeta => ({
  versionTitle, language: "en", actualLanguage: "en", languageFamilyName: "english", direction: "ltr", isSource: false, isPrimary: false, ...extra,
});
const AVAILABLE = [
  v("THE JPS TANAKH: Gender-Sensitive Edition", { priority: 8 }),
  v("The Koren Jerusalem Bible", { priority: 3 }),
  v("Die fünf Bücher Moses [de]", { languageFamilyName: "german", priority: 1 }),
  v("Alfredo cerhy [es]", { languageFamilyName: "spanish", priority: 2 }),
  v("La Biblia [es]", { languageFamilyName: "spanish", priority: 5 }),
  v("Miqra according to the Masorah", { language: "he", actualLanguage: "he", languageFamilyName: "hebrew", isSource: true, isPrimary: true }),
];
const prefs = (byCorpus: Record<string, Record<string, string>> = {}, translationLanguage?: string) => ({ byCorpus, ...(translationLanguage ? { translationLanguage } : {}) });

// @feature VER-014 @feature VER-002 @feature VER-001 @feature I18-001
describe("translation resolution (verified on sefaria.org, Exodus 1:1)", () => {
  it("no preferences: the site default", () => {
    expect(resolveTranslation({ corpus: "Tanakh", prefs: NO_PREFS, available: AVAILABLE })).toBeUndefined();
  });
  it("corpus preference", () => {
    expect(resolveTranslation({ corpus: "Tanakh", prefs: prefs({ Tanakh: { en: "The Koren Jerusalem Bible" } }), available: AVAILABLE })).toBe("english|The Koren Jerusalem Bible");
  });
  it("a corpus preference for another corpus, or for a version this text lacks, is ignored", () => {
    expect(resolveTranslation({ corpus: "Bavli", prefs: prefs({ Tanakh: { en: "The Koren Jerusalem Bible" } }), available: AVAILABLE })).toBeUndefined();
    expect(resolveTranslation({ corpus: "Tanakh", prefs: prefs({ Tanakh: { en: "No Such Version" } }), available: AVAILABLE })).toBeUndefined();
    expect(resolveTranslation({ prefs: prefs({ Tanakh: { en: "The Koren Jerusalem Bible" } }), available: AVAILABLE })).toBeUndefined(); // book with no corpus
  });
  it("translation language: the highest-priority translation in that language", () => {
    expect(resolveTranslation({ prefs: prefs({}, "es"), available: AVAILABLE })).toBe("spanish|La Biblia [es]");
    expect(resolveTranslation({ prefs: prefs({}, "de"), available: AVAILABLE })).toBe("german|Die fünf Bücher Moses [de]");
    expect(resolveTranslation({ prefs: prefs({}, "fr"), available: AVAILABLE })).toBeUndefined();
  });
  it("corpus preference beats language preference", () => {
    expect(resolveTranslation({ corpus: "Tanakh", prefs: prefs({ Tanakh: { en: "The Koren Jerusalem Bible" } }, "es"), available: AVAILABLE })).toBe("english|The Koren Jerusalem Bible");
  });
  it("an explicit version that exists beats everything; one that does not falls through", () => {
    const p = prefs({ Tanakh: { en: "The Koren Jerusalem Bible" } });
    expect(resolveTranslation({ explicit: "german|Die fünf Bücher Moses [de]", corpus: "Tanakh", prefs: p, available: AVAILABLE })).toBe("german|Die fünf Bücher Moses [de]");
    expect(resolveTranslation({ explicit: "english|Nonexistent", corpus: "Tanakh", prefs: p, available: AVAILABLE })).toBe("english|The Koren Jerusalem Bible");
  });
  it("never picks a source version", () => {
    expect(resolveTranslation({ corpus: "Tanakh", prefs: prefs({ Tanakh: { en: "Miqra according to the Masorah" } }), available: AVAILABLE })).toBeUndefined();
  });
});

describe("preference cookies", () => {
  it("reads the old site's cookies (URL-encoded JSON)", () => {
    const cookie = encodeURIComponent(JSON.stringify({ Tanakh: { en: "The Koren Jerusalem Bible" } }));
    expect(parseVersionPrefs({ [CORPUS_COOKIE]: cookie, [LANGUAGE_COOKIE]: "es" })).toEqual({ byCorpus: { Tanakh: { en: "The Koren Jerusalem Bible" } }, translationLanguage: "es" });
  });
  it("tolerates garbage", () => {
    expect(parseVersionPrefs({ [CORPUS_COOKIE]: "{nope", [LANGUAGE_COOKIE]: "<script>" })).toEqual({ byCorpus: {} });
    expect(parseVersionPrefs({ [CORPUS_COOKIE]: encodeURIComponent('{"Tanakh": 5, "Bavli": {"en": 7}}') })).toEqual({ byCorpus: {} });
    expect(hasVersionPrefs(parseVersionPrefs({}))).toBe(false);
  });
  it("records a choice under the en key, immutably, and round-trips", () => {
    const a = withVersionPreference(NO_PREFS, "Tanakh", "Die fünf Bücher Moses [de]");
    expect(a.byCorpus).toEqual({ Tanakh: { en: "Die fünf Bücher Moses [de]" } });
    expect(NO_PREFS.byCorpus).toEqual({});
    expect(parseVersionPrefs({ [CORPUS_COOKIE]: formatCorpusCookie(a) })).toEqual(a);
  });
});
