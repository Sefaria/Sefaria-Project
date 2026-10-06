/**
 * The metadata lines of the book page's "About This Text" module (the old NavSidebar `AboutText`, VERIFIED on sefaria.org
 * 2026-10-05: Berakhot "Composed: Talmudic Babylon, c.450 – c.550 CE"; Jastrow "Author: Marcus Jastrow" + "Composed: Philadelphia, c.1883 – c.1903 CE").
 *
 * @feature LIB-036 Sidebar module: About this text
 */
import type { IndexDetails } from "~/lib/catalog/index-details";

export interface AboutTextMeta {
  authors: { slug: string; en: string; he: string }[];
  /** "<place>, <date>" with parentheses removed, in each language. */
  composed?: { en: string; he: string };
}

const TANAKH_PARTS = ["Torah", "Prophets", "Writings"];

export function aboutTextMeta(d: Pick<IndexDetails, "authors" | "compPlaceString" | "compDateString" | "categories">): AboutTextMeta {
  const line = (lang: "en" | "he") =>
    [d.compPlaceString?.[lang], d.compDateString?.[lang]].filter((x): x is string => !!x).join(", ").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  // No dates for Tanakh's own books
  const tanakh = d.categories.length === 2 && d.categories[0] === "Tanakh" && TANAKH_PARTS.includes(d.categories[1]!);
  const en = tanakh ? "" : line("en"), he = tanakh ? "" : line("he");
  return {
    authors: (d.authors ?? []).map((a) => ({ slug: a.slug ?? "", en: a.en ?? "", he: a.he ?? "" })),
    composed: en || he ? { en, he } : undefined,
  };
}
