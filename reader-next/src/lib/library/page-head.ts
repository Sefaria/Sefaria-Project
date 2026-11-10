/**
 * The <title> and description of the library's own pages. The description is reader/views.py's `desc` (base.html's meta_desc
 * repeats it as og: and twitter: tags); the title is the one the reader sees: sefaria.org's server writes get_page_title's
 * ("Genesis | Sefaria Library") and its client replaces it after hydration (ReaderApp: "Genesis | The Sefaria Library"), as the
 * topics and calendars pages here already do. VERIFIED on www.sefaria.org and .org.il 2026-11-10 (Playwright, document.title after
 * load; curl for the descriptions):
 *   /texts                → "Sefaria: a Living Library of Jewish Texts Online" (he: "ספריא: ספרייה חיה של טקסטים יהודיים")
 *   /texts/Tanakh/Torah   → "Tanakh, Torah | The Sefaria Library" (he: "תנ"ך, תורה | האוסף של ספריא")
 *   /Genesis              → "Genesis | The Sefaria Library" (he: "בראשית | האוסף של ספריא"), its description then "Read the text of
 *                           Genesis online with commentaries and connections." (English in both interfaces, as live)
 *   /search?q=moses       → "moses | The Sefaria Library" (he: "moses | האוסף של ספריא"; no query: "Search"/"חיפוש"), noindex, nofollow
 * Not ported: the Hebrew interface's category description doubles the escaping of a quote mark ("התנ&quot;ך"), and a book without a
 * Hebrew title in the old client's cache is titled in English (Pesach Haggadah); here the Hebrew title is used when the index has one.
 *
 * @feature PLT-006 Page titles and meta descriptions
 */
import { isCategory, type TocCategory, type TocNode } from "~/lib/catalog/toc";

type Lang = "english" | "hebrew";
export type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };

const SUFFIX = { english: "The Sefaria Library", hebrew: "האוסף של ספריא" } as const;
export const pageTitle = (base: string, lang: Lang) => `${base} | ${SUFFIX[lang]}`;

/** title, description, and their og:/twitter: copies, as base.html writes them. */
export function pageMeta(title: string, description: string): MetaTag[] {
  return [
    { title },
    { property: "og:title", content: title },
    { name: "twitter:title", content: title },
    { name: "description", content: description },
    { property: "og:description", content: description },
    { name: "twitter:description", content: description },
  ];
}

export const NOINDEX: MetaTag = { name: "robots", content: "noindex, nofollow" };

/** texts_list: the library's home (and any /texts/… path that names no category). */
export function libraryHomeMeta(lang: Lang): MetaTag[] {
  return lang === "hebrew"
    ? pageMeta(
        "ספריא: ספרייה חיה של טקסטים יהודיים",
        "מאגר הגדול ביותר של מקורות יהודיים ללא תשלום בו ניתן לעיין בצורה מקוונת  במגוון מקורות החל מהתורה והמקרא, דרך המשנה והתלמוד, עולם המדרש, פרשנים ועוד.",
      )
    : pageMeta(
        "Sefaria: a Living Library of Jewish Texts Online",
        "The largest free library of Jewish texts available to read online in Hebrew and English including Torah, Tanakh, Talmud, Mishnah, Midrash, commentaries and more.",
      );
}

/** The category nodes along a path (lookup(cats)), or undefined when a name is not found. */
function trail(tree: readonly TocNode[], cats: readonly string[]): TocCategory[] | undefined {
  const out: TocCategory[] = [];
  let level: readonly TocNode[] = tree;
  for (const c of cats) {
    const found = level.find((n): n is TocCategory => isCategory(n) && n.category === c);
    if (!found) return undefined;
    out.push(found);
    level = found.contents ?? [];
  }
  return out;
}

/** texts_category_list: the path's names joined, and the category's description, short description or a default line. */
export function categoryMeta(tree: readonly TocNode[], cats: readonly string[], lang: Lang): MetaTag[] | undefined {
  const nodes = trail(tree, cats);
  if (!nodes?.length) return undefined;
  const he = lang === "hebrew";
  const names = nodes.map((n) => (he ? n.heCategory || n.category : n.category)).join(", ");
  const obj = nodes[nodes.length - 1]!;
  const desc = (he ? obj.heDesc : obj.enDesc) || (he ? obj.heShortDesc : obj.enShortDesc) || `Read ${names} texts online with commentaries and connections.`;
  return pageMeta(pageTitle(names, lang), desc);
}

/** A book's own page (text_toc / a book-level ref): its description in the interface language, then the "Read the text" line. */
export function bookMeta(book: { title: string; heTitle?: string; enDesc?: string; heDesc?: string }, lang: Lang): MetaTag[] {
  const he = lang === "hebrew";
  const name = he ? book.heTitle || book.title : book.title;
  const own = he ? book.heDesc : book.enDesc;
  const read = `Read the text of ${name} online with commentaries and connections.`;
  return pageMeta(pageTitle(name, lang), own ? `${own} ${read}` : read);
}

/** search: the query (or "Search"), one description, never indexed. */
export function searchMeta(q: string | undefined, lang: Lang): MetaTag[] {
  return [...pageMeta(pageTitle(q || (lang === "hebrew" ? "חיפוש" : "Search"), lang), "Search 3,000 years of Jewish texts in Hebrew and English translation."), NOINDEX];
}
