/**
 * Reader state carried in the URL query string, using the old site's parameter names and encodings so
 * every existing Sefaria link keeps working.
 *
 *   ?lang=bi|he|en            content language for this view
 *   ?aliyot=0|1               aliyot display for Torah
 *   ?ven=english|Title_With_Underscores     translation version (family | title, `_`=space, `;`=%3B)
 *   ?vhe=hebrew|Title                       primary version
 *
 * @feature RTE-043 Display language param (lang, lang2)
 * @feature RTE-046 Aliyot param
 * @feature RTE-028 Version parameter normalization
 */
import type { ContentLanguage } from "./settings";
import type { VersionSelection } from "~/lib/text/queries";

const LANG_PARAM: Record<string, ContentLanguage> = { bi: "bilingual", he: "hebrew", en: "english" };
const LANG_TO_PARAM: Record<ContentLanguage, string> = { bilingual: "bi", hebrew: "he", english: "en" };

export interface ReaderSearch {
  lang?: "bi" | "he" | "en";
  aliyot?: 0 | 1;
  ven?: string;
  vhe?: string;
  /** Sidebar view (see lib/connections/url.ts). Absent = sidebar closed. */
  with?: string;
  /** First sidebar's language (only without a second panel; see lib/workspace/url.ts). */
  lang2?: string;
  /** The version a "Translation Open" sidebar previews ("<Title_With_Underscores>|<lang>"). */
  vside?: string;
  /** Words a "Lexicon" sidebar looks up (selected in the text). */
  lookup?: string;
  /** The book page's tab. */
  tab?: "contents" | "versions";
  /** Further panels: p2, w2, lang2, aliyot2, ven2, vhe2, p3… (lib/workspace/url.ts). */
  [panelParam: `${"p" | "w" | "lang" | "aliyot" | "ven" | "vhe" | "vside" | "lookup"}${number}`]: string | undefined;
}

const PANEL_PARAM = /^(p|w|lang|aliyot|ven|vhe|vside|lookup)\d+$/;

/** TanStack Router `validateSearch`: keep only well-formed values, ignore everything else. */
export function validateReaderSearch(raw: Record<string, unknown>): ReaderSearch {
  const out: ReaderSearch = {};
  if (typeof raw.lang === "string" && raw.lang in LANG_PARAM) out.lang = raw.lang as ReaderSearch["lang"];
  if (raw.aliyot === 0 || raw.aliyot === 1 || raw.aliyot === "0" || raw.aliyot === "1") out.aliyot = Number(raw.aliyot) as 0 | 1;
  if (typeof raw.vside === "string" && raw.vside) out.vside = raw.vside;
  if (typeof raw.lookup === "string" && raw.lookup) out.lookup = raw.lookup;
  if (raw.tab === "contents" || raw.tab === "versions") out.tab = raw.tab;
  if (typeof raw.with === "string") out.with = raw.with;
  else if (typeof raw.with === "number" || typeof raw.with === "boolean") out.with = String(raw.with);
  for (const k of ["ven", "vhe"] as const) {
    const v = raw[k];
    if (typeof v === "string" && v.includes("|")) out[k] = v;
  }
  for (const [k, v] of Object.entries(raw)) {
    if (PANEL_PARAM.test(k) && (typeof v === "string" || typeof v === "number") && String(v) !== "") (out as Record<string, string>)[k] = String(v);
  }
  return out;
}

export const decodeVtitle = (t: string): string => t.replace(/_/g, " ").replace(/%3B/gi, ";");
export const encodeVtitle = (t: string): string => t.replace(/\s/g, "_").replace(/;/g, "%3B");

/** "english|Title_With_Underscores" → v3 API `version` value "english|Title With Underscores". */
export function versionParamToApi(param: string | undefined): string | undefined {
  if (!param) return undefined;
  const i = param.indexOf("|");
  if (i < 0) return undefined;
  const family = param.slice(0, i).trim().toLowerCase();
  const title = decodeVtitle(param.slice(i + 1));
  return family && title ? `${family}|${title}` : undefined;
}

export function versionSelectionFromSearch(s: ReaderSearch): VersionSelection {
  return { primary: versionParamToApi(s.vhe), translation: versionParamToApi(s.ven) };
}

/** Effective settings after applying the URL: `lang` and `aliyot` override stored preferences. */
export function applySearchToSettings<T extends { language: ContentLanguage; aliyotTorah: boolean }>(settings: T, s: ReaderSearch): T {
  return {
    ...settings,
    language: s.lang ? LANG_PARAM[s.lang]! : settings.language,
    aliyotTorah: s.aliyot !== undefined ? s.aliyot === 1 : settings.aliyotTorah,
  };
}

export const languageToParam = (l: ContentLanguage) => LANG_TO_PARAM[l] as "bi" | "he" | "en";

/** The query string (without `with`) that keeps display state across in-app links: "&lang=en&aliyot=1". */
export function carrySearch(s: ReaderSearch): string {
  const parts: string[] = [];
  if (s.lang) parts.push(`lang=${s.lang}`);
  if (s.aliyot !== undefined) parts.push(`aliyot=${s.aliyot}`);
  if (s.vhe) parts.push(`vhe=${encodeURIComponent(s.vhe).replace(/%7C/g, "|")}`);
  if (s.ven) parts.push(`ven=${encodeURIComponent(s.ven).replace(/%7C/g, "|")}`);
  return parts.length ? `&${parts.join("&")}` : "";
}
