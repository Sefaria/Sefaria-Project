/**
 * What the About box says, from a book's details and a section's versions. Ported from the old AboutBox and
 * VERIFIED on sefaria.org (2026-10-05: Genesis, Berakhot, Rashi on Genesis).
 *
 * @feature CON-039 About this text box
 * @feature VER-006 Current and alternate source versions in About
 */
import type { IndexAuthor, IndexDetails } from "~/lib/catalog/index-details";
import type { LabelLang } from "~/lib/reader/labels";
import type { VersionMeta } from "~/lib/text/model";

/** Authors with a name in this language; the box shows the author line only when English names exist. */
export function authorsFor(d: Pick<IndexDetails, "authors">, lang: LabelLang): IndexAuthor[] {
  return (d.authors ?? []).filter((a) => !!a[lang]);
}
export const showsAuthors = (d: Pick<IndexDetails, "authors">): boolean => authorsFor(d, "en").length > 0;

/** "Composed: Sinai/Canaan (c.1400 – c.400 BCE)": composition place, else publication place; composition date, else publication date. */
export function composedLine(d: IndexDetails, lang: LabelLang): string | undefined {
  const place = d.compPlaceString?.[lang] ?? d.compPlaceString?.en ?? d.compPlace ?? d.pubPlace ?? "";
  const date = d.compDateString ? (d.compDateString[lang] ?? "") : (d.pubDateString?.[lang] ?? "");
  const body = `${place} ${date}`.replace(/\s+/g, " ").trim();
  if (!body) return undefined;
  return `${lang === "he" ? "נוצר/נערך" : "Composed"}: ${body}`;
}

/** The description's markdown: English text, or the Hebrew description (falling back to the short one). */
export const descriptionFor = (d: IndexDetails, lang: LabelLang): string | undefined =>
  (lang === "en" ? d.enDesc : d.heDesc || d.heShortDesc) || undefined;

export interface AboutVersions {
  /** The translation on screen. */
  translation?: VersionMeta;
  /** The source version the URL names (`vhe`), if any. */
  source?: VersionMeta;
  /** Every other source version (flagged `isPrimary`), in the order the API gives them. */
  alternates: VersionMeta[];
  /** Heading of the alternates list: "Source Versions" when no source version is current. */
  alternatesAreAll: boolean;
}

export function aboutVersions(available: readonly VersionMeta[], current: { translationTitle?: string; sourceTitle?: string }): AboutVersions {
  const translation = available.find((v) => !v.isSource && v.versionTitle === current.translationTitle);
  const sources = available.filter((v) => v.isPrimary);
  const source = current.sourceTitle ? sources.find((v) => v.versionTitle === current.sourceTitle) : undefined;
  // The old box removed the current versions from their own language's list. The same title in another
  // language slot stays: Rashi on Genesis lists its English edition among the source versions (VERIFIED), because
  // there it is a separate version object (language "he") from the translation (language "en").
  const same = (a: VersionMeta, b: VersionMeta | undefined) => !!b && a.versionTitle === b.versionTitle && a.language === b.language;
  const alternates = sources.filter((v) => !same(v, source) && !same(v, translation));
  return { translation, source, alternates, alternatesAreAll: !source };
}

/** Section order: the translation first when the panel is in English, else the source version first. */
export const versionSectionOrder = (panelLanguage: "english" | "hebrew" | "bilingual"): ("translation" | "source")[] =>
  panelLanguage === "english" ? ["translation", "source"] : ["source", "translation"];
