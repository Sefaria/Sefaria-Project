import type { Catalog, TocCategory, TocNode } from "~/lib/catalog/toc";
import { isCategory } from "~/lib/catalog/toc";

/**
 * Hebrew names for link categories that are not top-level library categories (verified against /api/terms).
 * Anything unknown falls back to English, as the old client did (e.g. "Quoting Commentary" has no Hebrew term).
 */
const SIDEBAR_CATEGORY_HE: Record<string, string> = {
  Commentary: "מפרשים",
  Targum: "תרגומים",
  Essay: "מאמר",
};

/** Hard-coded descriptions for the two link categories that are not library categories (sefaria.js:2010-2013). */
const SIDEBAR_DESCRIPTIONS: Record<string, { en: string; he: string }> = {
  Commentary: {
    en: "Interpretations and discussions surrounding Jewish texts, ranging from early medieval to contemporary.",
    he: "פירושים ודיונים סביב טקסטים תורניים, מימי הביניים ועד ימינו.",
  },
  "Quoting Commentary": {
    en: "References to this source within commentaries on other texts in the wider library.",
    he: "התייחסויות אל המקור הנוכחי במפרשים משניים.",
  },
};

const topCategory = (catalog: Catalog | undefined, name: string): TocCategory | undefined =>
  catalog?.tree.find((n: TocNode): n is TocCategory => isCategory(n) && n.category === name);

export function categoryLabel(category: string, catalog: Catalog | undefined): { en: string; he: string } {
  return { en: category, he: topCategory(catalog, category)?.heCategory ?? SIDEBAR_CATEGORY_HE[category] ?? category };
}

export function categoryDescription(category: string, catalog: Catalog | undefined): { en?: string; he?: string } | undefined {
  const own = SIDEBAR_DESCRIPTIONS[category];
  if (own) return own;
  const c = topCategory(catalog, category);
  return c ? { en: c.enShortDesc || undefined, he: c.heShortDesc || undefined } : undefined;
}
