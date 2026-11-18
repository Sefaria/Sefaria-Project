// The page-data loader (PLAN §2.5, "Client-side navigation"). Every in-portal navigation fetches
// GET /_portal/page.json?path=<path>, which answers HTTP 200 with the same C3 payload the server would
// have embedded. Kind `redirect` navigates; kind `notfound` renders the 404 page.
import { redirect, type LoaderFunctionArgs } from 'react-router';
import type { NavSection, PagePayload, SidebarTree } from '../contracts';
import { PageDataError } from './data';
import { preloadEndpointSpec } from './endpointSpecs';

export const PAGE_JSON_URL = '/_portal/page.json';

/** Sidebar trees the client already holds, by section, with the generation they were built at. */
const navTrees = new Map<NavSection, SidebarTree>();

/** Remembers a payload's sidebar tree, so later payloads may omit it (C3 `PageNav.tree`). */
export function rememberNavTree(payload: PagePayload): void {
  if ((payload.kind === 'doc' || payload.kind === 'endpoint') && payload.nav?.tree) {
    navTrees.set(payload.nav.section, payload.nav.tree);
  }
}

/** Forgets every remembered tree (tests). */
export function resetNavTrees(): void {
  navTrees.clear();
}

function knownGeneration(): number | null {
  let generation: number | null = null;
  for (const tree of navTrees.values()) generation = Math.max(generation ?? 0, tree.generation);
  return generation;
}

function isPayload(value: unknown): value is PagePayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.contractVersion === 1 && typeof record.kind === 'string' && typeof record.path === 'string';
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!response.ok) throw new PageDataError(`GET ${url} answered ${response.status}`);
  return response.json();
}

/** Fills a payload's sidebar tree from the remembered trees, or fetches it when the client has none. */
async function completeNav(payload: PagePayload, signal: AbortSignal): Promise<PagePayload> {
  if ((payload.kind !== 'doc' && payload.kind !== 'endpoint') || payload.nav === null || payload.nav.tree !== null) {
    return payload;
  }
  const nav = payload.nav;
  let tree = navTrees.get(nav.section);
  if (tree === undefined || tree.generation !== nav.generation) {
    tree = (await getJson(nav.url, signal)) as SidebarTree;
    navTrees.set(nav.section, tree);
  }
  return { ...payload, nav: { ...nav, tree } } as PagePayload;
}

/** Fetches the payload for `path` (a path on this host, without query or fragment). */
export async function fetchPagePayload(path: string, signal: AbortSignal): Promise<PagePayload> {
  const params = new URLSearchParams({ path });
  const generation = knownGeneration();
  if (generation !== null) params.set('nav', String(generation));
  const body = await getJson(`${PAGE_JSON_URL}?${params}`, signal);
  if (!isPayload(body)) throw new PageDataError(`${PAGE_JSON_URL} did not answer a page payload`);
  const payload = await completeNav(body, signal);
  rememberNavTree(payload);
  return payload;
}

/** The route loader. Redirects throw React Router's `redirect`; every other kind is the route's data. */
export async function pageLoader({ request }: LoaderFunctionArgs): Promise<PagePayload> {
  const url = new URL(request.url);
  const payload = await fetchPagePayload(url.pathname, request.signal);
  if (payload.kind === 'redirect') {
    // Keep the query the visitor asked for when the target has none of its own. (A loader's Request
    // carries no fragment, so a fragment on a redirected link is lost, unlike an HTTP redirect.)
    const query = payload.location.includes('?') || payload.location.includes('#') ? '' : url.search;
    throw redirect(payload.location + query, payload.status);
  }
  // An endpoint page renders in one commit once its operation's spec is here (endpoint.tsx).
  await preloadEndpointSpec(payload);
  return payload;
}
