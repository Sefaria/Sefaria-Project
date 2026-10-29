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
 * sidebar is open). One quirk is deliberately NOT kept: the old client writes a later panel's sidebar search to the literal key
 * `sbsq{i}` (a missing `$`), which nothing reads back; here the URL is the state, so it is written as `sbsq<i>`. Every URL recorded from the live site
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

/**
 * The most panels a URL opens. Each panel is loaded on the server, so an address with p2…p500 would turn one request into hundreds
 * of API calls (CODE_REVIEW R-05); sefaria.org's layout shows far fewer side by side. Panels past the cap are dropped.
 */
export const MAX_PANELS = 6;

/** Read a workspace from the path's ref (already in human form, e.g. "Genesis 1:3") and the query. */
export function decodeWorkspace(firstRef: string, search: RawSearch): Workspace {
  const extra = Object.keys(search)
    .map((k) => /^p(\d+)$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) >= 2 && !!str(search[m[0]]))
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b)
    .slice(0, MAX_PANELS - 1);
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
/** Onkelos shows aliyot too (TXT-004) but is not in titleIsTorah, so the old client never writes its `aliyot`. */
const isOnkelos = (ref: string) => /^Onkelos (Genesis|Exodus|Leviticus|Numbers|Deuteronomy)/.test(ref);

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
    // An Onkelos panel keeps an `aliyot` its URL set: the old client applies it to the panel but drops it from the address, which
    // here (the URL is the state) would turn the aliyot off again at the first rewrite. One it never had is not written, as before.
    const aliyot = isTorah(p.ref) ? (p.aliyot ?? d.aliyot) : isOnkelos(p.ref) ? p.aliyot : undefined;
    out.push({ mode: "Text", url, versions: versionPairs(p), lang: p.lang ?? d.lang, ...(aliyot !== undefined ? { aliyot } : {}) });
    const a = p.asides.find((x) => x.kind === "connections");
    if (a) out.push({ mode: "Connections", url, sources: a.view, lang: a.lang ?? "bi", vside: a.vside, lookup: a.lookup, sbsq: a.sbsq, entity: a.entity });
  }
  return out;
}

/**
 * One query parameter, built once (CODE_REVIEW §3.3): `value` is what the router receives; `wire` is how the old client wrote it into
 * the address (some values percent-encoded, some raw), used only to assemble the byte-exact legacy string. The router's query is
 * built from values directly, never by re-parsing a string — so no value ("100%", "a&p2=Exodus.1") can break or inject anything.
 */
interface Param {
  key: string;
  value: string;
  wire: string;
}
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
/** A value the old client wrote as it is. */
const raw = (key: string, value: string | number): Param => ({ key, value: String(value), wire: String(value) });
/** A value whose written form is already encoded (refs, version titles): the router gets it decoded, as before. */
const encoded = (key: string, wire: string): Param => ({ key, value: safeDecode(wire), wire });
/**
 * Free text the old client wrote as it is (a sidebar search, a view name): written with `%` and `&` escaped, so the legacy string
 * workspaceUrl returns can be parsed back safely; values with neither (every URL sefaria.org writes in practice) keep their bytes.
 */
const text = (key: string, value: string): Param => ({ key, value, wire: value.replace(/%/g, "%25").replace(/&/g, "%26") });
/** Free text the old client percent-encoded (lookup words, entity names). */
const component = (key: string, value: string): Param => ({ key, value, wire: encodeURIComponent(value) });

/**
 * The workspace's address as a path and an ordered parameter list: the old makeHistoryState's URL assembly (see the header).
 * `defaults` are the reader's settings for what a panel has not set itself.
 */
function workspaceParams(ws: Workspace, d: UrlDefaults): { path: string; params: Param[] } | null {
  const h = histories(ws, d);
  if (!h.length) return null;
  const vparams = (pairs: [string, string][], i: number) => pairs.map(([l, v]) => encoded(`v${l}${i > 1 ? i : ""}`, v));
  const first = h[0] as Extract<Hist, { mode: "Text" }>;
  let path = first.url;
  let params: Param[] = [...vparams(first.versions, 0), raw("lang", first.lang), ...("aliyot" in first ? [raw("aliyot", first.aliyot!)] : [])];
  for (let i = 1; i < h.length; i++) {
    const cur = h[i]!, prev = h[i - 1]!;
    if (cur.mode === "Connections" && prev.mode === "Text") {
      const tail = cur.vside ? [encoded(`vside${i === 1 ? "" : i}`, encodeVtitle(cur.vside))] : [];
      if (i === 1) {
        // the short form for text + sidebar: the URL is the sidebar's ref; panel 1's aliyot is not carried (old quirk)
        path = cur.url;
        params = [
          ...vparams(prev.versions, 0),
          raw("lang", prev.lang),
          ...tail,
          ...(cur.lookup ? [component("lookup", cur.lookup)] : []),
          ...(cur.entity ? [text("namedEntity", cur.entity.slug)] : []),
          ...(cur.sbsq ? [text("sbsq", cur.sbsq)] : []),
          ...(cur.entity ? [component("namedEntityText", cur.entity.text)] : []),
          text("with", cur.sources),
        ];
      } else {
        // the old client rewrote this panel's entry from its p<i> onward, now with its sidebar
        const at = params.findIndex((x) => x.key === `p${i}`);
        if (at >= 0) params = params.slice(0, at);
        params.push(
          encoded(`p${i}`, cur.url),
          ...vparams(prev.versions, i),
          raw(`lang${i}`, prev.lang),
          ...("aliyot" in prev ? [raw(`aliyot${i}`, prev.aliyot!)] : []),
          ...tail,
          ...(cur.lookup ? [component(`lookup${i}`, cur.lookup)] : []),
          ...(cur.sbsq ? [text(`sbsq${i}`, cur.sbsq)] : []),
          ...(cur.entity ? [text(`namedEntity${i}`, cur.entity.slug), component(`namedEntityText${i}`, cur.entity.text)] : []),
          text(`w${i}`, cur.sources),
        );
      }
    } else {
      params.push(encoded(`p${i + 1}`, cur.url), ...(cur.mode === "Text" ? vparams(cur.versions, i + 1) : []));
    }
    params.push(raw(`lang${i + 1}`, cur.lang), ...("aliyot" in cur ? [raw(`aliyot${i + 1}`, cur.aliyot!)] : []));
  }
  return { path, params };
}

/**
 * The address for a workspace as sefaria.org writes it, byte for byte (see the header): for the legacy-URL tests and diagnostics.
 * The app navigates with encodeWorkspace.
 */
export function workspaceUrl(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): string | null {
  const w = workspaceParams(ws, defaults);
  if (!w) return null;
  const esc = (s: string) => s.replace(/\?/g, "%3F");
  return `/${esc(w.path)}?${w.params.map((p) => `${p.key}=${esc(p.wire)}`).join("&")}`;
}

/** The URL for a workspace as a path and an (ordered) query, for the router. */
export function encodeWorkspace(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): { path: string; search: Record<string, string> } | null {
  const w = workspaceParams(ws, defaults);
  if (!w) return null;
  const search: Record<string, string> = {};
  for (const p of w.params) search[p.key] = p.value;
  return { path: `/${w.path.replace(/\?/g, "%3F")}`, search };
}
