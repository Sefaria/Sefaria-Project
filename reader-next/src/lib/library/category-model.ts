/**
 * What a category page lists, from the catalog tree: which categories and texts, in what order, with what titles. A port of
 * the old TextCategoryPage's rules (title shortening, Hebrew ordering, the Talmud / Tosefta defaults, commentary titling),
 * without the DOM.
 *
 * @feature LIB-008 Category page contents list
 * @feature LIB-009 Talmud and Tosefta default sub-corpus
 * @feature LIB-010 Commentary category titling
 * @feature LIB-011 Talmud and Tosefta edition toggle
 * @feature LIB-012 Nested category sections and single-text collapse
 * @feature LIB-014 Text items open book page
 * @feature LIB-015 Short title rendering in category lists
 * @feature LIB-016 Hebrew ordering of category contents
 */
import { isCategory, type TocBook, type TocCategory, type TocNode } from "~/lib/catalog/toc";

export interface Bilingual {
  en: string;
  he: string;
}

/** The category node at a path of category names, or undefined. */
export function tocObjectByCategories(tree: readonly TocNode[], cats: readonly string[]): TocCategory | undefined {
  let level: readonly TocNode[] = tree;
  let found: TocCategory | undefined;
  for (const c of cats) {
    found = level.find((n): n is TocCategory => isCategory(n) && n.category === c);
    if (!found) return undefined;
    level = found.contents ?? [];
  }
  return found;
}

/** What a category lists: its contents (the whole tree for the library home). */
export const tocItemsByCategories = (tree: readonly TocNode[], cats: readonly string[]): TocNode[] =>
  cats.length ? (tocObjectByCategories(tree, cats)?.contents ?? []) : [...tree];

/** Talmud alone is the Bavli; Tosefta alone is the Vilna edition (the page shows those with a toggle). */
export function withDefaultCorpus(cats: readonly string[]): string[] {
  if (cats.length === 1 && cats[0] === "Talmud") return ["Talmud", "Bavli"];
  if (cats.length === 1 && cats[0] === "Tosefta") return ["Tosefta", "Vilna Edition"];
  return [...cats];
}

/** Hebrew names of the categories in the tree (the old Sefaria.hebrewTerm for categories). */
export function hebrewCategoryNames(tree: readonly TocNode[]): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (nodes: readonly TocNode[]) => {
    for (const n of nodes) if (isCategory(n)) {
      if (!m.has(n.category)) m.set(n.category, n.heCategory);
      walk(n.contents ?? []);
    }
  };
  walk(tree);
  m.set("Commentary", m.get("Commentary") ?? "מפרשים");
  return m;
}

/** The page's title. Talmud and Tosefta at depth two are just that; Commentary is "<parent> Commentary". */
export function pageTitle(cats: readonly string[], category: string, he: (c: string) => string): Bilingual {
  if ((cats[0] === "Talmud" || cats[0] === "Tosefta") && cats.length === 2) return { en: cats[0]!, he: he(cats[0]!) };
  if (category === "Commentary") {
    const on = cats.slice(-2)[0]!;
    return { en: `${on} Commentary`, he: `${he(on)} ${he("Commentary")}` };
  }
  return { en: category, he: he(category) };
}

const TOGGLES: Record<string, { subs: string[]; labels: Bilingual[] }> = {
  Talmud: { subs: ["Bavli", "Yerushalmi"], labels: [{ en: "Babylonian", he: "בבלי" }, { en: "Jerusalem", he: "ירושלמי" }] },
  Tosefta: { subs: ["Vilna Edition", "Lieberman Edition"], labels: [{ en: "Vilna", he: "דפוס וילנא" }, { en: "Lieberman", he: "מהדורת ליברמן" }] },
};
/** The Bavli / Yerushalmi (or Vilna / Lieberman) toggle: only on a depth-two Talmud or Tosefta page. */
export function subCategoryToggle(cats: readonly string[]): { sub: string; label: Bilingual; active: boolean; path: string[] }[] | undefined {
  const t = TOGGLES[cats[0] ?? ""];
  if (!t || cats.length !== 2) return undefined;
  return t.subs.map((sub, i) => ({ sub, label: t.labels[i]!, active: cats[1] === sub, path: [cats[0]!, sub] }));
}

const KEEP_FULL = new Set([
  "Imrei Yosher on Ruth", "Duties of the Heart (abridged)", "Midrash Mishlei", "Midrash Tehillim", "Midrash Tanchuma", "Midrash Aggadah",
  "Pesach Haggadah Edot Hamizrah", "Baal HaSulam's Preface to Zohar", "Baal HaSulam's Introduction to Zohar", "Zohar Chadash", "Midrash Shmuel",
  "Midrash Tannaim on Deuteronomy",
]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text's title in a category list, without the category's own name in front ("Rashi on Genesis" under Rashi shows "Genesis"). */
export function renderedTextTitle(title: string, heTitle: string, cats: readonly string[], he: (c: string) => string): Bilingual {
  if (title === "Pesach Haggadah") return { en: "Pesach Haggadah Ashkenaz", he: "הגדה של פסח אשכנז" };
  if (KEEP_FULL.has(title) || cats.at(-1) === "Siddur") return { en: title, he: heTitle };
  const enPrefix = new RegExp(`^(${["Jerusalem Talmud", "Tosefta Kifshutah", ...cats].map(esc).join("|")})(, |; | on | to | of )?`);
  const hePrefix = new RegExp(`^(${["תלמוד ירושלמי", "תוספתא כפשוטה", ...cats.map(he)].map(esc).join("|")})(, | על )?`);
  let en = cats.includes(title) ? title : title.replace(enPrefix, "");
  let hebrew = cats.map(he).includes(heTitle) ? heTitle : heTitle.replace(hePrefix, "");
  en = en.replace(/ \(Lieberman\)$/, "").trim(); // (the old output kept a leading space, invisible in HTML)
  hebrew = hebrew.replace(/ \(ליברמן\)$/, "");
  return { en, he: hebrew };
}

/** Hebrew order: explicit `order` (positive first, none, negative last); categories keep their English place; else by Hebrew title. */
export function hebrewContentSort(items: readonly TocNode[]): TocNode[] {
  const withIdx = items.map((item, enOrder) => ({ item, enOrder }));
  if (items.every((c) => (c as { base_text_order?: number }).base_text_order)) return [...items];
  const order = (n: TocNode) => (n as { order?: number }).order;
  const heTitle = (n: TocNode) => (isCategory(n) ? n.heCategory : (n as TocBook).heTitle);
  return withIdx
    .sort((a, b) => {
      const ao = order(a.item), bo = order(b.item);
      if (ao !== undefined || bo !== undefined) {
        const x = ao !== undefined ? -1 / ao : 0, y = bo !== undefined ? -1 / bo : 0;
        return x > y ? 1 : -1;
      }
      if (isCategory(a.item) !== isCategory(b.item)) return a.enOrder > b.enOrder ? 1 : -1;
      const ah = heTitle(a.item), bh = heTitle(b.item);
      if (ah && bh) return ah > bh ? 1 : -1;
      return a.enOrder > b.enOrder ? 1 : -1;
    })
    .map((x) => x.item);
}

/** A category's short description, set inline in the heading when it is five words or fewer. */
export function descriptionPlacement(short: string | undefined): { inline?: string; long?: string } {
  if (!short) return {};
  return short.split(" ").length > 5 ? { long: short } : { inline: `(${short})` };
}
