/**
 * Workspace ⇄ URL, in the old reader's grammar (docs/WORKSPACE.md, "The URL is still the state").
 *
 *   /<ref1>?lang=&aliyot=&ven=&vhe=&vside=&lookup=&sbsq=&namedEntity=&namedEntityText=&with=&lang2=
 *          &p2=<ref2>&w2=&lang2=&aliyot2=&ven2=&vhe2=&vside2=&lookup2=&sbsq2=  &p3=…
 *
 * Owner decision 2026-10-06 (docs/MULTIPANEL_PLAN.md §3): URLs are read and written exactly as www.sefaria.org writes them.
 * The old client numbers panels by its flat panel list, where a sidebar is a panel of its own: it takes a number slot, but is
 * written into the panel it belongs to (`with` / `w<k>`), and its language is `lang<k+1>`. So `[A+sidebar, B]` is
 * `?…&with=all&lang2=en&p3=B&lang3=bi`, and `[A, B+sidebar]` is `?…&p2=B&lang2=bi&w2=all&lang3=en`. encodeWorkspace is a port of
 * ReaderApp.makeHistoryState's URL assembly (ReaderApp.jsx:785-889), quirks included (panel 1's `aliyot` is dropped while its
 * sidebar is open; a later panel's sidebar search is written to the literal key `sbsq{i}`). Every URL recorded from the live site
 * round-trips byte for byte (legacy-urls.test.ts).
 *
 * @feature SHL-066 Panel state to URL serialization
 * @feature RTE-044 Sidebar mode param (with)
 * @feature RTE-043 Display language param (lang, lang2)
 */
import { leaf, row } from "~/lib/layout/tree";
import { refToUrl, urlToRef } from "~/lib/ref/url";
import { decodeVtitle, encodeVtitle, versionParamToApi } from "~/lib/reader/url-state";
import type { AsideState, PanelId, TextPanelState, Workspace } from "./types";
import { panelOrder } from "./ops";

export type RawSearch = Record<string, string | number | undefined>;

const LANGS = new Set(["bi", "he", "en"]);
const str = (v: unknown): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
const asLang = (v: unknown) => (LANGS.has(String(v)) ? (String(v) as "bi" | "he" | "en") : undefined);
const asAliyot = (v: unknown) => (String(v) === "0" ? 0 : String(v) === "1" ? 1 : undefined) as 0 | 1 | undefined;
const asSideLang = (v: unknown) => (v === "en" || v === "he" || v === "bi" ? v : undefined);

/** "english|Title With Spaces" (API form) → "english|Title_With_Spaces" (URL form). */
export function versionApiToParam(api: string | undefined): string | undefined {
  if (!api) return undefined;
  const i = api.indexOf("|");
  return i < 0 ? undefined : `${api.slice(0, i)}|${encodeVtitle(api.slice(i + 1))}`;
}

function panelFrom(id: PanelId, ref: string, s: RawSearch, suffix: string, asideLang?: "en" | "he" | "bi"): TextPanelState {
  const w = str(s[`w${suffix}`] ?? (suffix === "" ? s.with : undefined));
  const vside = str(s[`vside${suffix}`]);
  const lookup = str(s[`lookup${suffix}`]);
  const sbsq = str(s[`sbsq${suffix}`]);
  const entitySlug = str(s[`namedEntity${suffix}`]);
  const entityText = str(s[`namedEntityText${suffix}`]);
  const asides: AsideState[] =
    w !== undefined ? [{ id: `${id}a1`, kind: "connections", view: w, ...(asideLang ? { lang: asideLang } : {}), ...(vside ? { vside: decodeVtitle(vside) } : {}), ...(lookup ? { lookup } : {}), ...(sbsq ? { sbsq } : {}), ...(entitySlug ? { entity: { slug: entitySlug, text: entityText ?? "" } } : {}) }] : [];
  return {
    id,
    kind: "text",
    ref,
    versions: { primary: versionParamToApi(str(s[`vhe${suffix}`])), translation: versionParamToApi(str(s[`ven${suffix}`])) },
    ...(asLang(s[`lang${suffix}`]) ? { lang: asLang(s[`lang${suffix}`]) } : {}),
    ...(asAliyot(s[`aliyot${suffix}`]) !== undefined ? { aliyot: asAliyot(s[`aliyot${suffix}`]) } : {}),
    asides,
  };
}

/** Read a workspace from the path's ref (already in human form, e.g. "Genesis 1:3") and the query. */
export function decodeWorkspace(firstRef: string, search: RawSearch): Workspace {
  const extra = Object.keys(search)
    .map((k) => /^p(\d+)$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) >= 2 && !!str(search[m[0]]))
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  // A panel's sidebar language is lang<k+1> when no panel is numbered k+1 (the sidebar took that slot)
  const sideLang = (k: number) => (extra.includes(k + 1) ? undefined : asSideLang(search[`lang${k + 1}`]));
  const panels: TextPanelState[] = [panelFrom("p1", firstRef, search, "", sideLang(1))];
  extra.forEach((n, i) => {
    const id = `p${i + 2}` as PanelId;
    panels.push(panelFrom(id, urlToRef(String(search[`p${n}`])), search, String(n), sideLang(n)));
  });
  return {
    panels: Object.fromEntries(panels.map((p) => [p.id, p])),
    layout: panels.length === 1 ? leaf(panels[0]!.id) : row(...panels.map((p) => leaf(p.id))),
  };
}

/** What the URL says when a panel has not set its own: the reader's stored settings (the old panel settings). */
export interface UrlDefaults {
  lang: "bi" | "he" | "en";
  aliyot: 0 | 1;
}
export const DEFAULT_URL_DEFAULTS: UrlDefaults = { lang: "bi", aliyot: 0 };

/** The old Sefaria.titleIsTorah: the five books of the Torah (not their commentaries). */
const isTorah = (ref: string) => /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy)/.test(ref);

/** One entry of the old client's flat panel list. */
type Hist =
  | { mode: "Text"; url: string; versions: [string, string][]; lang: string; aliyot?: 0 | 1 }
  | { mode: "Connections"; url: string; sources: string; lang: string; vside?: string; lookup?: string; sbsq?: string; entity?: { slug: string; text: string } };

/** "family|Title" (API) per side → the old `&v<lang><n>=family|Title_With_Underscores` pairs, English first (currVersions order). */
function versionPairs(p: TextPanelState): [string, string][] {
  const out: [string, string][] = [];
  const en = versionApiToParam(p.versions.translation), he = versionApiToParam(p.versions.primary);
  if (en) out.push(["en", en]);
  if (he) out.push(["he", he]);
  return out;
}

function histories(ws: Workspace, d: UrlDefaults): Hist[] {
  const out: Hist[] = [];
  for (const id of panelOrder(ws)) {
    const p = ws.panels[id];
    if (!p || p.kind !== "text") continue;
    const url = refToUrl(p.ref);
    const aliyot = isTorah(p.ref) ? (p.aliyot ?? d.aliyot) : undefined;
    out.push({ mode: "Text", url, versions: versionPairs(p), lang: p.lang ?? d.lang, ...(aliyot !== undefined ? { aliyot } : {}) });
    const a = p.asides.find((x) => x.kind === "connections");
    if (a) out.push({ mode: "Connections", url, sources: a.view, lang: a.lang ?? "bi", vside: a.vside, lookup: a.lookup, sbsq: a.sbsq, entity: a.entity });
  }
  return out;
}

/**
 * The address for a workspace: the old makeHistoryState's URL, byte for byte (see the header). `defaults` are the reader's
 * settings for what a panel has not set itself.
 */
export function workspaceUrl(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): string | null {
  const h = histories(ws, defaults);
  if (!h.length) return null;
  const vparams = (pairs: [string, string][], i: number) => pairs.map(([l, v]) => `&v${l}${i > 1 ? i : ""}=${v}`).join("");
  const first = h[0] as Extract<Hist, { mode: "Text" }>;
  let url = `/${first.url}${vparams(first.versions, 0)}&lang=${first.lang}${"aliyot" in first ? `&aliyot=${first.aliyot}` : ""}`;
  for (let i = 1; i < h.length; i++) {
    const cur = h[i]!, prev = h[i - 1]!;
    if (cur.mode === "Connections" && prev.mode === "Text") {
      const tail = `${cur.vside ? `&vside${i === 1 ? "" : i}=${encodeVtitle(cur.vside)}` : ""}`;
      if (i === 1) {
        // the short form for text + sidebar: the URL is the sidebar's ref; panel 1's aliyot is not carried (old quirk)
        url = `/${cur.url}${vparams(prev.versions, 0)}&lang=${prev.lang}${tail}${cur.lookup ? `&lookup=${encodeURIComponent(cur.lookup)}` : ""}${cur.entity ? `&namedEntity=${cur.entity.slug}` : ""}${cur.sbsq ? `&sbsq=${cur.sbsq}` : ""}${cur.entity ? `&namedEntityText=${encodeURIComponent(cur.entity.text)}` : ""}&with=${cur.sources}`;
      } else {
        url = url.replace(new RegExp(`&p${i}=.*`), "");
        url += `&p${i}=${cur.url}${vparams(prev.versions, i)}&lang${i}=${prev.lang}${"aliyot" in prev ? `&aliyot${i}=${prev.aliyot}` : ""}${tail}${cur.lookup ? `&lookup${i}=${encodeURIComponent(cur.lookup)}` : ""}${cur.sbsq ? `&sbsq{i}=${cur.sbsq}` : ""}${cur.entity ? `&namedEntity${i}=${cur.entity.slug}&namedEntityText${i}=${encodeURIComponent(cur.entity.text)}` : ""}&w${i}=${cur.sources}`;
      }
    } else {
      url += `&p${i + 1}=${cur.url}${cur.mode === "Text" ? vparams(cur.versions, i + 1) : ""}`;
    }
    url += `&lang${i + 1}=${cur.lang}${"aliyot" in cur ? `&aliyot${i + 1}=${cur.aliyot}` : ""}`;
  }
  return url.replace(/\?/g, "%3F").replace("&", "?");
}

/** The URL for a workspace as a path and an (ordered) query, for the router. */
export function encodeWorkspace(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): { path: string; search: Record<string, string> } | null {
  const url = workspaceUrl(ws, defaults);
  if (!url) return null;
  const q = url.indexOf("?");
  const search: Record<string, string> = {};
  for (const pair of url.slice(q + 1).split("&")) {
    const j = pair.indexOf("=");
    search[pair.slice(0, j)] = decodeURIComponent(pair.slice(j + 1).replace(/%3F/g, "?"));
  }
  return { path: url.slice(0, q), search };
}
