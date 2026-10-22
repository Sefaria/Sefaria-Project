/**
 * The "Related Texts" summary: how many links per category and per book, in the order readers expect.
 * Port of `Sefaria.linkSummary` (sefaria.js:1768-1979) plus the top-level presentation rules from
 * ConnectionsSummary (ConnectionsPanel.jsx:707-839).
 *
 * @feature CON-019 Connection categories summary
 * @feature CON-020 Zero-count commentators shown greyed out
 * @feature CON-021 Commentator ordering rules
 * @feature CON-023 Top-level summary: Quoting Commentary merged, collapse to 4
 * @feature CON-024 Essay links in summary
 * @feature CON-025 Category view with per-book filters
 */
import type { Catalog } from "~/lib/catalog/toc";
import { dedupeLinks, withoutEssays, type RelatedLink } from "./links";

export interface BookSummary {
  /** Collective title ("Rashi"): the name used in filters. */
  book: string;
  heBook: string;
  category: string;
  count: number;
  hasEnglish: boolean;
  /** The actual index ("Rashi on Genesis"), used for descriptions and links. */
  fullTitle?: string;
  enShortDesc?: string;
  heShortDesc?: string;
}

export interface CategorySummary {
  category: string;
  count: number;
  hasEnglish: boolean;
  books: BookSummary[];
}

/** Categories promoted for a given base-text category, after Commentary (and Targum for Tanakh). */
export const CATEGORY_ORDER_OVERRIDES: Record<string, readonly string[]> = {
  Tanakh: ["Talmud", "Midrash", "Halakhah"],
  Mishnah: ["Tanakh", "Mishnah", "Talmud"],
  Talmud: ["Tanakh", "Talmud", "Halakhah"],
  Midrash: ["Tanakh", "Talmud", "Midrash"],
  Halakhah: ["Tanakh", "Talmud", "Halakhah"],
  Kabbalah: ["Tanakh", "Talmud", "Kabbalah"],
  Liturgy: ["Tanakh", "Talmud", "Liturgy"],
  "Jewish Thought": ["Tanakh", "Talmud", "Jewish Thought"],
  Tosefta: ["Tanakh", "Mishnah", "Talmud"],
  Chasidut: ["Tanakh", "Talmud", "Midrash"],
  Musar: ["Tanakh", "Talmud", "Musar"],
  Responsa: ["Tanakh", "Talmud", "Halakhah"],
  "Second Temple": [],
  Reference: [],
};

/** Commentators shown first within a category of the base text. (English adds one Mishnah entry.) */
const TOP_BOOKS_HEBREW: Record<string, readonly string[]> = {
  Tanakh: ["Rashi", "Ibn Ezra", "Ramban", "Sforno"],
  Talmud: ["Rashi", "Rashbam", "Tosafot"],
  Mishnah: ["Bartenura", "Rambam", "Ikar Tosafot Yom Tov", "Yachin", "Boaz"],
};
const TOP_BOOKS_ENGLISH: Record<string, readonly string[]> = {
  ...TOP_BOOKS_HEBREW,
  Mishnah: ["Bartenura", "English Explanation of Mishnah", "Rambam", "Ikar Tosafot Yom Tov", "Yachin", "Boaz"],
};

/** Order books within a category: the hard-coded top list first, then alphabetical (by Hebrew title in Hebrew). */
export function sortBooks(baseCategory: string | undefined, hebrew: boolean) {
  const top = (hebrew ? TOP_BOOKS_HEBREW : TOP_BOOKS_ENGLISH)[baseCategory ?? ""] ?? [];
  return (a: BookSummary, b: BookSummary): number => {
    const ai = top.indexOf(a.book);
    const bi = top.indexOf(b.book);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) < (bi === -1 ? 999 : bi) ? -1 : 1;
    return hebrew ? (a.heBook > b.heBook ? 1 : -1) : a.book > b.book ? 1 : -1;
  };
}

export interface SummaryContext {
  catalog: Catalog | undefined;
  /** Top category of the base text ("Tanakh"), for ordering. */
  baseCategory: string | undefined;
  /** Every link in the base text's section, so commentators with no link on this verse still appear (greyed, count 0). */
  sectionLinks?: readonly RelatedLink[];
  /** When the selection is narrower than its section, add zero-count commentators from the section. */
  narrowerThanSection?: boolean;
  hebrew?: boolean;
}

export function linkSummary(rawLinks: readonly RelatedLink[], ctx: SummaryContext): CategorySummary[] {
  const links = withoutEssays(dedupeLinks(rawLinks));
  const byCategory = new Map<string, CategorySummary & { bookMap: Map<string, BookSummary> }>();

  const bookFor = (cat: CategorySummary & { bookMap: Map<string, BookSummary> }, l: RelatedLink): BookSummary => {
    const name = l.collectiveTitle.en;
    let b = cat.bookMap.get(name);
    if (!b) {
      const full = ctx.catalog?.books.get(l.index_title);
      const bookEntry = ctx.catalog?.books.get(name);
      b = {
        book: name,
        heBook: bookEntry?.heTitle ?? l.collectiveTitle.he,
        category: cat.category,
        count: 0,
        hasEnglish: false,
        fullTitle: l.index_title,
        enShortDesc: full?.enShortDesc || full?.enDesc || bookEntry?.enShortDesc || undefined,
        heShortDesc: full?.heShortDesc || full?.heDesc || bookEntry?.heShortDesc || undefined,
      };
      cat.bookMap.set(name, b);
    }
    return b;
  };
  const catFor = (category: string) => {
    let c = byCategory.get(category);
    if (!c) {
      c = { category, count: 0, hasEnglish: false, books: [], bookMap: new Map() };
      byCategory.set(category, c);
    }
    return c;
  };

  for (const l of links) {
    const c = catFor(l.category);
    c.count++;
    c.hasEnglish ||= l.sourceHasEn;
    const b = bookFor(c, l);
    b.count++;
    b.hasEnglish ||= l.sourceHasEn;
  }

  // Commentators present in the section but not on this selection are listed with a zero count.
  if (ctx.narrowerThanSection) {
    for (const l of ctx.sectionLinks ?? []) {
      if (l.category !== "Commentary") continue;
      bookFor(catFor("Commentary"), l);
    }
  }

  const list: CategorySummary[] = [...byCategory.values()].map(({ bookMap, ...c }) => ({
    ...c,
    books: [...bookMap.values()].sort(sortBooks(ctx.baseCategory, ctx.hebrew ?? false)),
  }));

  const order = [...(ctx.catalog?.topCategories ?? [])];
  order.splice(0, 0, "Commentary"); // Commentary always first
  order.splice(2, 0, "Targum"); // Targum after Tanakh
  const overrides = ctx.baseCategory ? CATEGORY_ORDER_OVERRIDES[ctx.baseCategory] : undefined;
  if (overrides && overrides.length > 1) order.splice(1, 0, ...overrides);
  const rank = (c: string) => {
    const i = order.indexOf(c);
    return i === -1 ? order.length : i;
  };
  return list.sort((a, b) => rank(a.category) - rank(b.category));
}

export interface EssayRow {
  title: { en: string; he: string };
  sourceRef: string;
}

export interface TopLevelSummary {
  essays: EssayRow[];
  /** Category rows to show; Quoting Commentary is folded into Commentary. */
  categories: CategorySummary[];
  /** How many collapsed rows exist beyond the first four. */
  hiddenCount: number;
  visible: CategorySummary[];
}

export const COLLAPSED_CATEGORY_COUNT = 4;

/** Essays that apply to the version on screen: `anchorVersion.title` is "ALL" or matches the shown version in that language. */
export function essaysFor(links: readonly RelatedLink[], shownVersionTitles: Record<string, string | undefined>): EssayRow[] {
  const out: EssayRow[] = [];
  for (const l of dedupeLinks(links)) {
    if (l.category !== "Essay" || !l.displayedText || !l.anchorVersion) continue;
    const shown = shownVersionTitles[l.anchorVersion.language] ?? "NONE";
    if (l.anchorVersion.title === "ALL" || (l.anchorVersion.title !== "NONE" && shown === l.anchorVersion.title)) {
      out.push({ title: l.displayedText, sourceRef: l.sourceRef });
    }
  }
  return out;
}

/**
 * The Resources view's summary. Quoting Commentary is hidden as its own row; its count and English flag are
 * added to Commentary (a Commentary row is created when only quoting commentary exists). Only the first four
 * rows are visible until expanded.
 */
export function topLevelSummary(summary: readonly CategorySummary[], essays: EssayRow[] = []): TopLevelSummary {
  const quoting = summary.find((c) => c.category === "Quoting Commentary");
  let rows = summary.filter((c) => c.category !== "Quoting Commentary").map((c) => ({ ...c }));
  if (quoting) {
    const commentary = rows.find((c) => c.category === "Commentary");
    if (commentary) {
      commentary.count += quoting.count;
      commentary.hasEnglish ||= quoting.hasEnglish;
    } else {
      rows = [{ category: "Commentary", count: quoting.count, hasEnglish: quoting.hasEnglish, books: [] }, ...rows];
    }
  }
  return { essays, categories: rows, visible: rows.slice(0, COLLAPSED_CATEGORY_COUNT), hiddenCount: Math.max(0, rows.length - COLLAPSED_CATEGORY_COUNT) };
}

/**
 * Rows for one category's detail view. Commentary shows Commentary and Quoting Commentary together
 * (Commentary first); any other category shows only itself, or a zero placeholder when empty.
 */
export function categoryView(summary: readonly CategorySummary[], category: string): CategorySummary[] {
  if (category === "Commentary") return ["Commentary", "Quoting Commentary"].map((c) => summary.find((s) => s.category === c)).filter((c): c is CategorySummary => Boolean(c));
  const hit = summary.find((c) => c.category === category);
  return [hit ?? { category, count: 0, hasEnglish: false, books: [] }];
}
