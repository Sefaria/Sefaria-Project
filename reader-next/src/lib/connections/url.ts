/**
 * The `?with=` parameter: which sidebar view is open. Same grammar as the old site so existing links work.
 *
 *   with=all                        Resources (the summary)
 *   with=Commentary ConnectionsList a category's books                 (spaces may be underscores)
 *   with=Rashi                      the connected texts, filtered to Rashi
 *   with=Rashi|Quoting              quoting commentary named Rashi     (suffixes |Quoting, |Essay)
 *   with=WebPages / WebPage:<site>  the web pages citing the passage, all sites or one
 *   with=Translations / About / …   other sidebar modes (named)
 *
 * @feature RTE-044 Sidebar mode param (with)
 * @feature CON-006 Sidebar mode switching
 */

/** Named sidebar modes the old site could deep-link into. Filters and categories are everything else. */
export const SIDEBAR_MODES = [
  "Sheets", "Notes", "Translations", "Translation Open", "Version Open", "About", "AboutSheet", "Navigation", "WebPages",
  "extended notes", "Topics", "Torah Readings", "manuscripts", "Lexicon", "SidebarSearch", "Guide", "LinkerAdmin",
  "Advanced Tools", "Share", "Feedback", "Add To Sheet", "Add Connection",
] as const;
export type SidebarModeName = (typeof SIDEBAR_MODES)[number];

export type ConnectionsView =
  | { view: "resources" }
  /** Web pages citing the passage: the sites, or one site's pages (`with=WebPages`, `with=WebPage:<site>`). */
  | { view: "webpages"; site?: string }
  | { view: "category"; category: string }
  | { view: "texts"; filter: string }
  | { view: "mode"; mode: SidebarModeName };

const MODE_SET: ReadonlySet<string> = new Set(SIDEBAR_MODES);
const CATEGORY_SUFFIX = " ConnectionsList";

export function parseWith(raw: string | undefined): ConnectionsView | undefined {
  if (raw === undefined) return undefined;
  const value = raw.replace(/_/g, " ").trim();
  if (value === "" || value === "all") return { view: "resources" };
  if (value.endsWith(CATEGORY_SUFFIX)) return { view: "category", category: value.slice(0, -CATEGORY_SUFFIX.length) };
  if (value === "WebPages") return { view: "webpages" };
  // Site names keep their underscores and spaces as written (raw is not the `_`→space form used for filters).
  if (/^WebPage:/.test(raw.trim())) return { view: "webpages", site: raw.trim().slice("WebPage:".length) };
  if (MODE_SET.has(value)) return { view: "mode", mode: value as SidebarModeName };
  return { view: "texts", filter: value };
}

export function formatWith(v: ConnectionsView): string {
  switch (v.view) {
    case "resources":
      return "all";
    case "category":
      return `${v.category}${CATEGORY_SUFFIX}`;
    case "webpages":
      return v.site ? `WebPage:${v.site}` : "WebPages";
    case "texts":
      return v.filter;
    case "mode":
      return v.mode;
  }
}

/** Every connections-sidebar state is a link: ctrl-click opens it in a new tab. */
export const withHref = (basePath: string, v: ConnectionsView, extra = ""): string =>
  `${basePath}?with=${encodeURIComponent(formatWith(v)).replace(/%20/g, "+")}${extra}`;
