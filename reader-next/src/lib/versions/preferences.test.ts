import { describe, expect, it } from "vitest";
import type { VersionMeta } from "~/lib/text/model";
import { CORPUS_COOKIE, formatCorpusCookie, hasVersionPrefs, LANGUAGE_COOKIE, NO_PREFS, normalizeRequestedVersion, parseVersionPrefs, resolveTranslation, withVersionPreference } from "./preferences";

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

// Genesis 1:1's versions in the API's order (priority first), trimmed: each case below was measured on www.sefaria.org 2026-11-12 as the
// address it redirects to (reader/views.py _get_normalized_versions)
const GENESIS = [
  v("THE JPS TANAKH: Gender-Sensitive Edition", { priority: 8 }),
  v("The Koren Jerusalem Bible", { priority: 5 }),
  v("Miqra according to the Masorah", { language: "he", actualLanguage: "he", languageFamilyName: "hebrew", direction: "rtl", isSource: true, isPrimary: true, priority: 2 }),
  v("Bible du Rabbinat 1899 [fr]", { languageFamilyName: "french", priority: 1 }),
  v("Die fünf Bücher Moses, trans. Dr. J. Wohlgemuth, Rödelheim 1899 [de]", { languageFamilyName: "german", priority: 1 }),
  v("Tanach with Nikkud", { language: "he", actualLanguage: "he", languageFamilyName: "hebrew", direction: "rtl", isSource: true, isPrimary: true }),
  v("Yehoyesh's Yiddish Tanakh Translation [yi]", { language: "he", actualLanguage: "yi", languageFamilyName: "yiddish", direction: "rtl" }),
  v("Miqra Mevoar, trans. and edited by David Kokhav, Jerusalem 2020", { language: "he", actualLanguage: "he", languageFamilyName: "hebrew", direction: "rtl" }),
];
/** "family|Title" (or a bare title) → the parts the normalizer takes. */
const req = (x: string) => {
  const i = x.indexOf("|");
  return i < 0 ? { title: x } : { family: x.slice(0, i), title: x.slice(i + 1) };
};
const norm = (requested: string | undefined, side: "primary" | "translation") => normalizeRequestedVersion(requested === undefined ? undefined : req(requested), side, GENESIS);

// @feature VER-014
describe("a version the address names that the text lacks (measured on sefaria.org)", () => {
  it("a version the text has stays", () => {
    expect(norm("english|The Koren Jerusalem Bible", "translation")).toBe("english|The Koren Jerusalem Bible");
    expect(norm("hebrew|Tanach with Nikkud", "primary")).toBe("hebrew|Tanach with Nikkud");
    expect(norm(undefined, "translation")).toBeUndefined();
  });
  it("a missing title: the first version of the same language (Ibn Ezra's English for the JPS Tanakh; German for German)", () => {
    expect(norm("german|No Such Version", "translation")).toBe("german|Die fünf Bücher Moses, trans. Dr. J. Wohlgemuth, Rödelheim 1899 [de]");
    expect(norm("english|No Such Version", "translation")).toBe("english|THE JPS TANAKH: Gender-Sensitive Edition");
    expect(norm("hebrew|No Such Version", "primary")).toBe("hebrew|Miqra according to the Masorah");
    const ibnEzra = [v("Ibn Ezra's commentary on the Pentateuch, tran. and annot. by H. Norman Strickman and Arthur M. Silver. Menorah Pub., 1988-2004"), v("Piotrkow, 1907-1911", { languageFamilyName: "hebrew", direction: "rtl", isSource: true, isPrimary: true })];
    expect(normalizeRequestedVersion(req("english|THE JPS TANAKH: Gender-Sensitive Edition"), "translation", ibnEzra)).toBe(
      "english|Ibn Ezra's commentary on the Pentateuch, tran. and annot. by H. Norman Strickman and Arthur M. Silver. Menorah Pub., 1988-2004",
    );
  });
  it("a title that exists in another language: the named language wins while it has a version", () => {
    expect(norm("french|The Koren Jerusalem Bible", "translation")).toBe("french|Bible du Rabbinat 1899 [fr]");
    expect(norm("english|Bible du Rabbinat 1899 [fr]", "translation")).toBe("english|THE JPS TANAKH: Gender-Sensitive Edition");
  });
  it("a language with no version on this side: the title decides, under its own language", () => {
    expect(norm("english|Tanach with Nikkud", "primary")).toBe("hebrew|Tanach with Nikkud");
  });
  it("nothing to match: dropped (preferences, then the default, decide)", () => {
    expect(norm("klingon|No Such Version", "translation")).toBeUndefined();
    expect(norm("klingon|No Such Version", "primary")).toBeUndefined();
    expect(norm("hebrew|Miqra according to the Masorah", "translation")).toBeUndefined(); // the source is no translation
  });
  it("an old link naming only the title, or an empty language or title, resolves as on sefaria.org", () => {
    expect(norm("The Koren Jerusalem Bible", "translation")).toBe("english|The Koren Jerusalem Bible");
    expect(norm("|The Koren Jerusalem Bible", "translation")).toBe("english|The Koren Jerusalem Bible");
    expect(norm("english|", "translation")).toBe("english|THE JPS TANAKH: Gender-Sensitive Edition");
  });
  it("a title with `_` or a non-breaking space matches its own link (the address reads `_` as a space), even when not first", () => {
    const odd = [...GENESIS, v("Title_With_Underscore"), v("Title\u00a0NBSP")];
    expect(normalizeRequestedVersion({ family: "english", title: "Title With Underscore" }, "translation", odd)).toBe("english|Title_With_Underscore");
    expect(normalizeRequestedVersion({ family: "english", title: "Title NBSP" }, "translation", odd)).toBe("english|Title\u00a0NBSP");
  });
  it("a right-to-left translation named as one stays (the old server drops it, so a Yiddish link never opened: not ported)", () => {
    expect(norm("yiddish|Yehoyesh's Yiddish Tanakh Translation [yi]", "translation")).toBe("yiddish|Yehoyesh's Yiddish Tanakh Translation [yi]");
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
