/**
 * The book page's rules: when a ref is the book itself, which category a book lives under, where "Start Reading" starts.
 *
 * @feature BOK-001 Book page (text table of contents)
 * @feature BOK-002 Book page header and category link
 * @feature BOK-003 Start / Continue Reading button
 */
import { parseHumanRef } from "~/lib/ref/url";
import { SITE_ORIGIN } from "~/lib/config";

/** "Genesis", "Rashi on Genesis" (no section, no node): the book as a whole. Complex-text nodes ("Pesach Haggadah, Kadesh") are texts. */
export function bookTitleOf(ref: string): string | undefined {
  const p = parseHumanRef(ref);
  return p.sections.length === 0 && ref.trim().length > 0 ? p.title : undefined;
}

/** The index's own title spelled the way the URL spelled it (case, spaces/underscores) — the page is canonical only then. */
export const sameTitle = (a: string, b: string): boolean => a.replace(/_/g, " ").trim().toLowerCase() === b.replace(/_/g, " ").trim().toLowerCase();

/** The category a book is filed under for the label above its title (old `category` prop). */
export function primaryCategory(categories: readonly string[], dependence?: string | null): string {
  if (dependence === "Commentary" || dependence === "Targum") return dependence;
  return categories.includes("Guides") ? "Guides" : (categories[0] ?? "");
}

/** Where the category label leads (library pages this client does not have yet are the old site's). */
export function categoryHref(categories: readonly string[], dependence?: string | null, base = SITE_ORIGIN): string {
  const cat = primaryCategory(categories, dependence);
  let path: readonly string[];
  if (cat === "Commentary") {
    const baseCategory = categories[0]!;
    const comm = categories.find((c) => c === "Commentary" || c.includes(` on ${baseCategory}`));
    path = categories.slice(0, categories.indexOf(comm ?? baseCategory) + 1);
  } else if (cat === "Targum" || cat === "Guides") path = categories.slice(0, categories.indexOf(cat) + 1);
  else if (cat === "Talmud") path = categories.slice(0, categories.indexOf("Talmud") + 2);
  else path = [cat];
  return `${base}/texts/${path.join("/")}`;
}

/** The edition credited under the title of books in a category (only the Bavli: the William Davidson Edition). */
export function categoryAttribution(categories: readonly string[]): { en: string; he: string; href: string } | undefined {
  if (categories[0] === "Talmud" && categories[1] === "Bavli") {
    return { en: "The William Davidson Edition", he: "מהדורת ויליאם דוידסון", href: `${SITE_ORIGIN}/william-davidson-talmud` };
  }
  return undefined;
}
