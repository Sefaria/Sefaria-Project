/**
 * Where an asset panel's page comes from (AssetPanelState.asset):
 *  - `sample:<name>`  a page shipped with the reader (public/assets/samples/<name>.html): the demo, and the e2e tests' asset;
 *  - `local:<key>`    a file the reader opened in this tab, kept in sessionStorage (a preview: nothing leaves the browser);
 *  - otherwise        a stored asset's id (`<uuid>` or `<uuid>@<version>`), served by Sefaria Social from its content origin.
 *
 * Samples and local files are shown with `srcdoc` and a Content-Security-Policy meta tag added at the top (the trusted script CDNs
 * only: what Claude's own artifacts load from). Stored assets are framed by URL, so the content server's own CSP header applies
 * (LINKED_PANELS_AND_ASSETS_PLAN.md §6.6).
 *
 * @feature SHL-093 Asset panel
 */
import { PUBLIC_CONFIG } from "~/lib/config";
import { MAX_ASSET_BYTES } from "~/lib/assets/manifest";

export type AssetSource = { kind: "html"; html: string } | { kind: "url"; url: string; title?: string };

const LOCAL_PREFIX = "sefaria.asset.";
/** The script hosts a previewed file may load from (plan D7's trusted CDN list). */
export const TRUSTED_CDNS = ["https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"];

/** The policy put at the top of a previewed page: no network beyond the trusted CDNs, no forms, no frames. */
export function previewPolicy(cdns: readonly string[] = TRUSTED_CDNS): string {
  const c = cdns.join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${c}`,
    `style-src 'unsafe-inline' ${c}`,
    `font-src data: ${c}`,
    `img-src data: blob: ${c}`,
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/** The page with the policy as the first thing in it (a meta CSP applies only to what follows it). */
export function withPolicy(html: string, policy = previewPolicy()): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + meta + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html;
}

/** Keep a file the reader opened, for this tab; returns its `local:` name, or null when the browser will not keep it. */
export function keepLocal(html: string): string | null {
  if (new Blob([html]).size > MAX_ASSET_BYTES) return null;
  const key = `local:${hash(html)}`;
  try {
    sessionStorage.setItem(LOCAL_PREFIX + key, html);
    return key;
  } catch {
    return null; // storage full or blocked
  }
}

/** A short stable name for a file's content (FNV-1a, base 36). */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The page to show for an asset name. */
export async function loadAssetSource(asset: string, signal?: AbortSignal): Promise<AssetSource> {
  if (asset.startsWith("sample:")) {
    const name = asset.slice(7);
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("No such sample");
    const res = await fetch(`/assets/samples/${name}.html`, { signal });
    if (!res.ok) throw new Error(`Sample ${name}: ${res.status}`);
    return { kind: "html", html: await res.text() };
  }
  if (asset.startsWith("local:")) {
    let html: string | null = null;
    try {
      html = sessionStorage.getItem(LOCAL_PREFIX + asset);
    } catch {
      html = null;
    }
    if (html === null) throw new Error("This page was opened from a file in another tab or session; open the file again.");
    return { kind: "html", html };
  }
  return loadStoredAsset(asset, signal);
}

/** A stored asset: its metadata from Sefaria Social's API, framed from the content URL the API gives (plan §6.3). */
async function loadStoredAsset(asset: string, signal?: AbortSignal): Promise<AssetSource> {
  const api = PUBLIC_CONFIG.social?.apiOrigin;
  if (!api) throw new Error("Stored pages are not available here (no Sefaria Social server is configured).");
  const [id, version] = asset.split("@");
  if (!id || !/^[0-9a-f-]{8,64}$/i.test(id)) throw new Error("Not a page name the reader knows.");
  const res = await fetch(`${api}/api/v1/claude-assets/${encodeURIComponent(id)}`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "This page was removed or never existed." : `The page could not be loaded (${res.status}).`);
  const body = (await res.json()) as StoredAsset;
  const v = version ? body.versions?.find((x) => String(x.n) === version || x.id === version) : undefined;
  const url = v?.contentUrl ?? body.contentUrl ?? body.currentVersion?.contentUrl;
  if (!url || !/^https?:\/\//.test(url)) throw new Error("The page has no content to show.");
  // the content URL is the server's, policy and all (its context is signed there: never widened or rewritten here)
  return { kind: "url", url, title: body.title };
}

interface StoredAsset {
  title?: string;
  contentUrl?: string;
  currentVersion?: { contentUrl?: string };
  versions?: { id?: string; n?: number; contentUrl?: string }[];
}
