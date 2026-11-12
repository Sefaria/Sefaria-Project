/**
 * The site's static information pages (sites/sefaria/urls.py `static_pages` and `static_pages_by_lang`, plus /digitized-by-sefaria)
 * and who renders each in the new reader.
 *
 *  - "content": Django's content block (`/<page>?format=json&lang=en|he`, reader/static_content.py) rendered inside this client's
 *    shell (features/static-page). Its scripts are not run; the few that matter are done here (the About sidebar's selected item,
 *    the strategy deck's width).
 *    The About pages /team, /products and /jobs are "content" with a `mount`: Django's content block around the part the old page
 *    filled from the CMS (Strapi), which this client fills itself (features/static-page/cms).
 *  - "port": this client has its own version of the page (Django's content block is only an empty mount point for a legacy React
 *    component): features/static-page/ports.
 *  - "django": still Django's page, passed through as before, for the reason given (a legacy React component or CMS page not ported
 *    yet, a whole document of its own, a page with its own view). Each is an accepted exit (scripts/exits-allowlist.json).
 *
 * All of these are Library-host pages only: on the Voices host every one of them goes to Django exactly as before (Voices is out of
 * scope; Django's own Voices behaviour, e.g. redirecting the About-sidebar pages to the Library, is unchanged).
 */

export type StaticPageOwner = "content" | "port" | "django";

export interface StaticPageEntry {
  owner: StaticPageOwner;
  /** Why a "django" page is not rendered here (also in the exits allowlist). */
  reason?: string;
  /** The page's own content is the same in both languages except the strings Django translates (false: en/ and he/ templates). */
  byLang?: boolean;
  /** A "content" page whose English and Hebrew versions differ in who renders them: the Hebrew one is "content", the English one this. */
  enOwner?: StaticPageOwner;
  enReason?: string;
  /**
   * A "content" page whose content block has a mount point the old page filled from the CMS: the element's id, and the part of
   * features/static-page/cms that fills it here.
   */
  mount?: { id: string; part: CmsPart };
}

export type CmsPart = "team" | "products" | "jobs";

const LEGACY_REACT = "Django's content block is only a mount point for a legacy React component (StaticPages.jsx); not ported yet";
const CONTEST = "a finished contest's landing page (legacy React, StaticPages.jsx), not linked from the reader; not ported";

export const STATIC_PAGES: Readonly<Record<string, StaticPageEntry>> = {
  // sites/sefaria/urls.py static_pages, in its order
  strategy: { owner: "content" },
  supporters: { owner: "content" },
  visualizations: { owner: "content" },
  jobs: { owner: "content", mount: { id: "jobsPageContent", part: "jobs" } },
  terms: { owner: "content" },
  "privacy-policy": { owner: "content" },
  "coming-soon": { owner: "content" },
  "shraga-silverstein": { owner: "content" },
  "henry-and-julia-koschitzky-apps": { owner: "content" },
  "adin-even-israel-steinsaltz": { owner: "content" },
  "william-davidson-talmud": { owner: "content" },
  "nash-bravmann-collection": { owner: "content" },
  linker: { owner: "content" },
  ios: { owner: "content" },
  mobile: { owner: "port" },
  "sefaria-edition": { owner: "content" },
  "sefaria-community-translation": { owner: "content" },
  "contributed-to-sefaria": { owner: "content" },
  "random-walk-through-torah": { owner: "django", reason: "a whole document of its own (no content block: Django answers standalone)" },
  educators: { owner: "port" },
  "the-sefaria-story": { owner: "content" },
  "aramaic-translation-contest": { owner: "django", reason: "a 2019 contest page whose mailing-list form runs on jQuery; not ported" },
  newsletter: { owner: "django", reason: "the newsletter sign-up page is a 1,700-line legacy React flow (static/js/NewsletterSignUpPage): its own task" },
  testimonials: { owner: "content" },
  "torah-tab": { owner: "content" },
  "dicta-thanks": { owner: "content" },
  "daf-yomi": { owner: "content" },
  "powered-by-sefaria-contest-2020": { owner: "django", reason: CONTEST },
  "powered-by-sefaria-contest-2021": { owner: "django", reason: CONTEST },
  "ramban-sponsorships": { owner: "django", reason: LEGACY_REACT },
  contest: { owner: "django", reason: CONTEST },
  "design-system": { owner: "content" },
  "word-by-word": { owner: "django", reason: LEGACY_REACT },
  cloudflare_site_is_down_en: { owner: "django", reason: "a whole document of its own (Cloudflare's outage page)" },
  cloudflare_site_is_down_he: { owner: "django", reason: "a whole document of its own (Cloudflare's outage page)" },
  team: { owner: "content", mount: { id: "teamMembersPageContent", part: "team" } },
  products: { owner: "content", mount: { id: "productsPageContent", part: "products" } },
  "link-to-annual-report": { owner: "content" },
  "mobile-about-menu": { owner: "content" },
  // "updates" (/updates, New Additions) is a page of the new reader of its own, not one of these
  pioneers: { owner: "content" },
  ai: { owner: "content" },
  metrics: { owner: "django", reason: "its own view (reader/views.py metrics: charts from the database), no content answer" },
  "fleishman-hirsch-on-torah-in-english": { owner: "content" },
  // static_pages_by_lang: templates/static/en/ and he/
  about: { owner: "content", byLang: true },
  // the Hebrew page is plain content; the English one mounts the legacy DonatePage component: ported
  "ways-to-give": { owner: "content", byLang: true, enOwner: "port" },
  // its own view (reader/views.py digitized_by_sefaria), with a content answer
  "digitized-by-sefaria": { owner: "content" },
};

export const STATIC_PAGE_NAMES: readonly string[] = Object.keys(STATIC_PAGES);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `/about` or `/about/` (Django's patterns take an optional trailing slash), for any static page. */
const STATIC_PATH_RE = new RegExp(`^/(${STATIC_PAGE_NAMES.map(escape).join("|")})/?$`);

/** The static page a path names (`/about/` → "about"), or null. */
export function staticPageName(pathname: string): string | null {
  return STATIC_PATH_RE.exec(pathname)?.[1] ?? null;
}

/** Is this path one of the static information pages (whoever renders it)? */
export const isStaticPagePath = (pathname: string): boolean => STATIC_PATH_RE.test(pathname);

/** A page of the list by its name: own entries only ("constructor", "toString", "__proto__" are not pages). */
export const staticPageEntry = (name: string): StaticPageEntry | undefined => (Object.hasOwn(STATIC_PAGES, name) ? STATIC_PAGES[name] : undefined);

/** Who renders this page in this interface language. */
export function staticPageOwner(name: string, lang: "en" | "he"): StaticPageOwner | null {
  const entry = staticPageEntry(name);
  if (!entry) return null;
  return lang === "en" && entry.enOwner ? entry.enOwner : entry.owner;
}

/** Does this client render the page (content or its own port) in at least one language? Else it is Django's on every host. */
export const rendersStaticPage = (name: string): boolean => {
  const e = staticPageEntry(name);
  return !!e && (e.owner !== "django" || (e.enOwner !== undefined && e.enOwner !== "django"));
};
