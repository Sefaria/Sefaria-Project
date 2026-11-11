/**
 * The model of a page this client has its own version of (T-F32: /mobile, /educators, the English /ways-to-give), without asking Django:
 * the port renders its whole markup, so all it needs from the old page is its head — the title and description of
 * templates/static/<page>.html (`{% trans %}` in each language) — and base.html's body class. Django's content block for these pages
 * is only an empty React mount point, so a Django without the content mode is no reason to hand them over.
 * port-model.test.ts checks these against Django's own answers (e2e/fixtures/static-pages, rendered from the templates).
 *
 * @feature STA-008 Mobile app page
 */
import type { StaticPageModel } from "./content";

type Head = { title: string; description: string };
const HEADS: Record<string, { en: Head; he?: Head }> = {
  mobile: {
    en: { title: "Sefaria Mobile Apps", description: "Download the free Sefaria Apps for iOS and Android." },
    he: { title: "ספריא בנייד", description: "הורידו את האפליקציות החינמיות של ספריא לאייפון ולאנדרואיד" },
  },
  // the template's strings have no Hebrew translation: the English in both interfaces, as Django renders them
  educators: { en: { title: "Teach with Sefaria", description: "Teach with Sefaria" }, he: { title: "Teach with Sefaria", description: "Teach with Sefaria" } },
  // the English page only (the Hebrew /ways-to-give is Django's content)
  "ways-to-give": { en: { title: "Donate to Sefaria", description: "Support Sefaria by making a tax-deductible donation online or by check or wire transfer." } },
};

/** The page's model in this language, or null when this client has no port of it there. */
export function portModel(page: string, lang: "en" | "he"): StaticPageModel | null {
  const head = Object.hasOwn(HEADS, page) ? HEADS[page]![lang] : undefined;
  if (!head) return null;
  return { page, lang, title: head.title, description: head.description, html: "", css: [], inlineCss: "", bodyClass: lang === "he" ? "interface-hebrew" : "interface-english" };
}
