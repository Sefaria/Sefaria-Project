/**
 * The reader's `<title>`, as sefaria.org's client writes it (ReaderApp.makeHistoryState → Sefaria.getPageTitle), VERIFIED on
 * www.sefaria.org 2026-11-10 (Playwright, document.title after load), English and Hebrew interfaces:
 *   /Genesis.1                       → "Genesis 1 | The Sefaria Library"            he: "בראשית א׳ | האוסף של ספריא"
 *   /Genesis.1.1?with=Rashi          → "Genesis 1:1 with Rashi | The Sefaria Library" he: "בראשית א׳:א עם רש"י | האוסף של ספריא"
 *   /Genesis.1.1?with=Commentary     → "… with Commentary …"                          he: "… עם מפרשים …"
 *   with=Translations / About / Sheets / Web Pages / Quoting Commentary → "with Translations" (תרגומים), "with About" (אודות),
 *                                       "with Sheets" (דפי מקורות), "with Web Pages", "with Quoting Commentary" (פרשנות מצטטת)
 *   with=all, with=<category> ConnectionsList → no "with" ("Genesis 1:1 | The Sefaria Library")
 *   /this-page-does-not-exist-xyz    → "Page Not Found | Sefaria"                   he: "הדף שביקשתם איננו נמצא | ספריא"
 * The suffix is the client's; Django's server-rendered one ("| Sefaria Library") is replaced as soon as the old page hydrates.
 * Not ported (legacy bugs): two panels repeat the suffix ("Genesis 1 | The Sefaria Library & Exodus 1 | The Sefaria Library"):
 * here it is written once, after the panels joined by " & " (Hebrew interface " | ", the old `reader_app.and`); a Hebrew ref the
 * old client had not cached (a range across sections) was titled in English, as it is here too.
 *
 * @feature PLT-006 Page titles and meta descriptions
 */
import { pageTitle } from "~/lib/library/page-head";
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";

export type TitleLang = "english" | "hebrew";

/** `reader_app.and`, `reader_app.with` (static/js/sefaria/i18n/interface/*.json). */
const AND: Record<TitleLang, string> = { english: " & ", hebrew: " | " };
const WITH: Record<TitleLang, string> = { english: " with ", hebrew: " עם " };

/** CONNECTION_MODE_STRING_IDS (static/js/constants.js) and their strings in en.json / he.json. */
const MODE_NAMES: Record<string, { en: string; he: string }> = {
  About: { en: "About", he: "אודות" },
  "Web Pages": { en: "Web Pages", he: "דפי אינטרנט" },
  Sheets: { en: "Sheets", he: "דפי מקורות" },
  Notes: { en: "Notes", he: "הערות" },
  Translations: { en: "Translations", he: "תרגומים" },
  Versions: { en: "Versions", he: "מהדורות" },
  "Version Open": { en: "Version Open", he: "מהדורה פתוחה" },
  Share: { en: "Share", he: "שיתוף" },
};

/** Names the old client's Hebrew terms gave that are not modes, categories or books (verified live). */
const HEBREW_NAMES: Record<string, string> = { "Quoting Commentary": "פרשנות מצטטת" };

/**
 * What follows "with" for a sidebar's `with` value, or null when the old title names no source (Resources, a category's list).
 * `hebrewName` names a filter (a book, a category) in Hebrew when it can; anything else stays as written, as the old client's.
 */
export function sidebarTitlePart(view: string | undefined, lang: TitleLang, hebrewName: (name: string) => string | undefined = () => undefined): string | null {
  const raw = view?.replace(/_/g, " ").trim();
  if (!raw || raw === "all" || raw.includes("ConnectionsList")) return null;
  const mode = MODE_NAMES[raw];
  if (mode) return lang === "hebrew" ? mode.he : mode.en;
  return lang === "hebrew" ? (HEBREW_NAMES[raw] ?? hebrewName(raw) ?? raw) : raw;
}

export interface TitlePanel {
  /** The panel's ref (canonical, English). */
  ref: string;
  /** The ref in Hebrew, when known. */
  heRef?: string;
  /** Its sidebar's `with` value, when one is open. */
  view?: string;
}

/** The reader's `<title>` for its panels. */
export function readerPageTitle(panels: readonly TitlePanel[], lang: TitleLang, hebrewName?: (name: string) => string | undefined): string {
  const parts = panels.map((p) => {
    const base = lang === "hebrew" ? (p.heRef ?? p.ref) : p.ref;
    const side = sidebarTitlePart(p.view, lang, hebrewName);
    return side ? `${base}${WITH[lang]}${side}` : base;
  });
  return pageTitle(parts.join(AND[lang]), lang);
}

/** Django's 404 page's title (templates/static/404.html via get_page_title), in each interface. */
export const notFoundTitle = (lang: TitleLang): string => (lang === "hebrew" ? "הדף שביקשתם איננו נמצא | ספריא" : "Page Not Found | Sefaria");

/**
 * A ref in Hebrew from the sections loaded for it (each the server's `ref`/`heRef`): a section as the server names it, a segment or a
 * range of segments inside the first section as the old client built it (section's Hebrew ref, then unpunctuated numerals:
 * "בראשית א׳:א", Sefaria.makeSegments). Undefined for anything else (a range across sections).
 */
export function hebrewRefOf(ref: string, sections: readonly { ref: string; heRef: string }[]): string | undefined {
  const exact = sections.find((s) => s.ref === ref);
  if (exact) return exact.heRef;
  const first = sections[0];
  if (!first || !ref.startsWith(`${first.ref}:`)) return undefined;
  const m = /^([1-9]\d*)(?:-([1-9]\d*))?$/.exec(ref.slice(first.ref.length + 1));
  if (!m) return undefined;
  const n = (s: string) => encodeHebrewNumeral(Number(s), { punctuation: false });
  return `${first.heRef}:${n(m[1]!)}${m[2] ? `-${n(m[2])}` : ""}`;
}
