/**
 * Which translation to show when the URL names none. Resolution order, ported from the old client
 * (Sefaria._getVersionObjects) and VERIFIED on sefaria.org 2026-10-05:
 *
 *   1. an explicit `ven` that exists for this text;
 *   2. the corpus preference — `version_preferences_by_corpus` = {"Tanakh": {"en": "<version title>"}} — if that
 *      version exists for this text (a preference for a version the text lacks is ignored);
 *   3. the translation-language preference (`translation_language_preference`, e.g. "es"): the highest-priority
 *      translation in that language;
 *   4. the site default.
 *
 * Choosing a translation records a corpus preference under the "en" key whatever its actual language (a German
 * translation is stored as {"en": "Die fünf Bücher Moses…"}), as the old site does.
 *
 * @feature VER-014 Version resolution order
 * @feature VER-002 Version preferences by corpus cookie
 * @feature VER-001 Translation language preference
 * @feature I18-001 Content, translation and version preferences
 */
import type { VersionMeta } from "~/lib/text/model";
import { bucketLanguage } from "./translations";

export interface VersionPrefs {
  /** corpus → { language key → version title } */
  byCorpus: Record<string, Record<string, string>>;
  /** Language code of the preferred translation language ("es"), if set. */
  translationLanguage?: string;
}

export const NO_PREFS: VersionPrefs = { byCorpus: {} };
export const CORPUS_COOKIE = "version_preferences_by_corpus";
export const LANGUAGE_COOKIE = "translation_language_preference";

/** Read both cookies (already parsed into name → value). Tolerates absent or corrupt values. */
export function parseVersionPrefs(cookies: Record<string, string | undefined>): VersionPrefs {
  const byCorpus: VersionPrefs["byCorpus"] = {};
  try {
    const raw = cookies[CORPUS_COOKIE];
    const parsed: unknown = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    if (parsed && typeof parsed === "object") {
      for (const [corpus, langs] of Object.entries(parsed as Record<string, unknown>)) {
        if (!langs || typeof langs !== "object") continue;
        const clean = Object.fromEntries(Object.entries(langs as Record<string, unknown>).filter(([, t]) => typeof t === "string" && t) as [string, string][]);
        if (Object.keys(clean).length) byCorpus[corpus] = clean;
      }
    }
  } catch {
    /* corrupt cookie: no preferences */
  }
  const lang = cookies[LANGUAGE_COOKIE];
  return { byCorpus, ...(lang && /^[a-z]{2,3}$/.test(lang) ? { translationLanguage: lang } : {}) };
}

export const hasVersionPrefs = (p: VersionPrefs): boolean => Object.keys(p.byCorpus).length > 0 || !!p.translationLanguage;

/** Old VersionPreferences.update: a new object with one preference set. */
export function withVersionPreference(prefs: VersionPrefs, corpus: string, title: string, lang = "en"): VersionPrefs {
  return { ...prefs, byCorpus: { ...prefs.byCorpus, [corpus]: { ...prefs.byCorpus[corpus], [lang]: title } } };
}

/** The cookie's value (URL-encoded JSON, as the old site writes it). */
export const formatCorpusCookie = (prefs: VersionPrefs): string => encodeURIComponent(JSON.stringify(prefs.byCorpus));

export const toApiVersion = (v: Pick<VersionMeta, "languageFamilyName" | "versionTitle">): string => `${v.languageFamilyName}|${v.versionTitle}`;

const priorityOf = (v: VersionMeta): number => Number(v.priority) || 0;

/** Old Sefaria._findInVersions: the highest-priority match (the first one wins a tie). */
function best(versions: readonly VersionMeta[]): VersionMeta | undefined {
  let top: VersionMeta | undefined;
  for (const v of versions) if (!top || priorityOf(v) > priorityOf(top)) top = v;
  return top;
}

export interface ResolveArgs {
  /** The `ven` from the URL, "family|title". */
  explicit?: string;
  /** The text's corpus (`corpora[0]` of its index), if it has one. */
  corpus?: string;
  prefs: VersionPrefs;
  /** The text's available versions (from the text response). */
  available: readonly VersionMeta[];
}

/** The translation to show, "family|title", or undefined for the site default. */
export function resolveTranslation({ explicit, corpus, prefs, available }: ResolveArgs): string | undefined {
  const translations = available.filter((v) => !v.isSource);
  if (explicit) {
    const [family, ...rest] = explicit.split("|");
    const title = rest.join("|");
    if (translations.some((v) => v.versionTitle === title && v.languageFamilyName === family)) return explicit;
  }
  const preferredTitle = corpus ? prefs.byCorpus[corpus]?.en : undefined;
  if (preferredTitle) {
    const found = translations.find((v) => v.versionTitle === preferredTitle);
    if (found) return toApiVersion(found);
  }
  if (prefs.translationLanguage) {
    const found = best(translations.filter((v) => bucketLanguage(v) === prefs.translationLanguage));
    if (found) return toApiVersion(found);
  }
  return undefined;
}
