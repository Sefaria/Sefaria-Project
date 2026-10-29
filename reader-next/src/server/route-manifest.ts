/**
 * Which server answers a path, decided before rendering (CODE_REVIEW R-36: every path this client did not know was rendered in full —
 * its API calls made and thrown away — and only its 404 sent it on to Django).
 *
 *  - this client's own pages (the library, search, sign-in, assets…) render here;
 *  - every other path is a ref: rendered here when its title is a text — a title of the catalog (kept once on the server), else one the
 *    name API calls a ref ("Gen.1.1", a complex text's node) — and handed to Django when it is not ("/about", "/Tanakh", a page of the
 *    old site this client does not have). The name check is cached.
 *  - When the check cannot be made (the API is down) the path renders here, as before: its 404 still goes to Django.
 */
import { SEFARIA_API_ORIGIN } from "~/lib/api/client";
import { serverCatalogTree, type TocNode } from "~/lib/catalog/toc";
import { parseUrlRef } from "~/lib/ref/url";

const CLIENT_EXACT = new Set(["/", "/search", "/login", "/register", "/texts"]);
const CLIENT_PREFIXES = ["/texts/", "/interface/", "/password/reset/confirm/", "/_serverFn/", "/assets/", "/auth/", "/brand/", "/fonts/", "/img/", "/@", "/__"];

export type RouteOwner = "client" | "django";

const NAME_TTL_MS = 60 * 60_000;
const NAME_MAX = 5000;
const names = new Map<string, { at: number; isRef: boolean }>();

let titles: { tree: Promise<TocNode[]>; set?: Set<string> } | undefined;
/** The catalog's titles when they are loaded; a request never waits for the catalog (the name check answers meanwhile). */
function catalogTitles(): Set<string> | undefined {
  const tree = serverCatalogTree();
  if (titles?.tree !== tree) {
    const entry: { tree: Promise<TocNode[]>; set?: Set<string> } = { tree };
    titles = entry;
    tree.then((t) => {
      const s = new Set<string>();
      const walk = (nodes: readonly TocNode[]) => {
        for (const n of nodes) "category" in n ? walk(n.contents ?? []) : s.add(n.title.toLowerCase());
      };
      walk(t);
      entry.set = s;
    }, () => undefined);
  }
  return titles.set;
}

/** Load the catalog's titles now (at start, so the first requests need no name check). */
export async function warmRouteManifest(): Promise<void> {
  catalogTitles();
  await titles?.tree.catch(() => undefined);
  await Promise.resolve();
}

async function nameIsRef(title: string, now: number, fetcher: typeof fetch): Promise<boolean | undefined> {
  const hit = names.get(title);
  if (hit && now - hit.at < NAME_TTL_MS) return hit.isRef;
  try {
    const r = await fetcher(`${SEFARIA_API_ORIGIN}/api/name/${encodeURIComponent(title)}?ref_only=1&limit=0`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return undefined;
    const isRef = Boolean(((await r.json()) as { is_ref?: unknown }).is_ref);
    if (names.size >= NAME_MAX) names.delete(names.keys().next().value as string);
    names.set(title, { at: now, isRef });
    return isRef;
  } catch {
    return undefined;
  }
}

export async function routeOwner(pathname: string, opts: { now?: number; fetcher?: typeof fetch } = {}): Promise<RouteOwner> {
  if (CLIENT_EXACT.has(pathname) || CLIENT_PREFIXES.some((p) => pathname.startsWith(p))) return "client";
  const first = pathname.slice(1).split("/")[0] ?? "";
  if (!first) return "client";
  const title = parseUrlRef(first).title;
  if (!title) return "client";
  if (catalogTitles()?.has(title.toLowerCase())) return "client";
  const isRef = await nameIsRef(title, opts.now ?? Date.now(), opts.fetcher ?? fetch);
  return isRef === false ? "django" : "client";
}

/** Test helper. */
export function resetRouteManifest(): void {
  names.clear();
  titles = undefined;
}
