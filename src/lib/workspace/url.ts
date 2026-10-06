/**
 * Workspace ⇄ URL, in the old reader's grammar (docs/WORKSPACE.md, "The URL is still the state").
 *
 *   /<ref1>?lang=&aliyot=&ven=&vhe=&vside=&lookup=&sbsq=&namedEntity=&namedEntityText=&with=&lang2=
 *          &p2=<ref2>&w2=&lang2=&aliyot2=&ven2=&vhe2=&vside2=&lookup2=&sbsq2=  &p3=…
 *
 * Reading accepts what the old client wrote, including numbering gaps (it numbered panels by the flat panel
 * array, sidebars included, atlas SHL-066 BUG). Writing numbers panels sequentially, which both readers accept.
 * `lang2` is ambiguous in the old grammar: with a `p2` it is panel 2's language, otherwise panel 1's sidebar.
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
const asSideLang = (v: unknown) => (v === "en" || v === "he" ? v : undefined);

/** "english|Title With Spaces" (API form) → "english|Title_With_Spaces" (URL form). */
export function versionApiToParam(api: string | undefined): string | undefined {
  if (!api) return undefined;
  const i = api.indexOf("|");
  return i < 0 ? undefined : `${api.slice(0, i)}|${encodeVtitle(api.slice(i + 1))}`;
}

function panelFrom(id: PanelId, ref: string, s: RawSearch, suffix: string, asideLang?: "en" | "he"): TextPanelState {
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
  const p1Aside = extra.includes(2) ? undefined : asSideLang(search.lang2);
  const panels: TextPanelState[] = [panelFrom("p1", firstRef, search, "", p1Aside)];
  extra.forEach((n, i) => {
    const id = `p${i + 2}` as PanelId;
    panels.push(panelFrom(id, urlToRef(String(search[`p${n}`])), search, String(n)));
  });
  return {
    panels: Object.fromEntries(panels.map((p) => [p.id, p])),
    layout: panels.length === 1 ? leaf(panels[0]!.id) : row(...panels.map((p) => leaf(p.id))),
  };
}

/** The URL for a workspace: the first panel's ref path and the query (ordered as the old client wrote it). */
export function encodeWorkspace(ws: Workspace): { path: string; search: Record<string, string> } | null {
  const order = panelOrder(ws).map((id) => ws.panels[id]!).filter((p) => p.kind === "text");
  if (!order.length) return null;
  const search: Record<string, string> = {};
  const put = (k: string, v: string | number | undefined) => {
    if (v !== undefined) search[k] = String(v);
  };
  order.forEach((p, i) => {
    const sfx = i === 0 ? "" : String(i + 1);
    if (i > 0) put(`p${sfx}`, refToUrl(p.ref));
    put(`vhe${sfx}`, versionApiToParam(p.versions.primary));
    put(`ven${sfx}`, versionApiToParam(p.versions.translation));
    put(`lang${sfx}`, p.lang);
    put(`aliyot${sfx}`, p.aliyot);
    const aside = p.asides.find((a) => a.kind === "connections");
    if (aside) {
      put(`vside${sfx}`, aside.vside ? encodeVtitle(aside.vside) : undefined);
      put(`lookup${sfx}`, aside.lookup);
      put(`sbsq${sfx}`, aside.sbsq);
      put(`namedEntity${sfx}`, aside.entity?.slug);
      put(`namedEntityText${sfx}`, aside.entity?.slug ? aside.entity.text : undefined);
      put(i === 0 ? "with" : `w${sfx}`, aside.view);
      if (i === 0 && aside.lang && order.length === 1) put("lang2", aside.lang);
    }
  });
  return { path: `/${refToUrl(order[0]!.ref)}`, search };
}
