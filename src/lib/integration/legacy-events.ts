/**
 * The events other apps on the page send the reader, as sefaria.org's ReaderApp receives them (TARGET_ARCHITECTURE §6.12, D4).
 * Outside React: installed once per page by the shell, it acts through the functions it is given.
 *
 *  - `sefaria:bootstrap-url` — "go here" (the Library Assistant's links: a text, a search, a topic). `detail` is a URL, or
 *    `{url, replaceHistory?}`. A page of this client is a navigation in the app (with `replaceHistory`, it replaces the entry — the
 *    assistant's own links do); a page Django serves, or another Sefaria site, is loaded in full; a URL of any other site is ignored
 *    (the assistant opens those in a new tab itself). As on sefaria.org a ref "closes all panels": the address is the whole workspace.
 *  - `sefaria:settings-updated` — the reader's settings changed elsewhere (the Django settings page): what was read about the reader
 *    is read again.
 *
 * Events the assistant sends that are not for the page: `appetizer_click` (its own analytics, dispatched on the element; sefaria.org
 * has no listener) — listed in docs/INTEGRATION.md.
 *
 * @feature AI-011 Library Assistant chatbot widget
 */
import { isDjangoPage } from "~/lib/routing/django-paths";

export const BOOTSTRAP_URL_EVENT = "sefaria:bootstrap-url";
export const SETTINGS_UPDATED_EVENT = "sefaria:settings-updated";

export interface LegacyEventTargets {
  /** A navigation in the app to a path and query of this client. */
  navigate: (to: { pathname: string; search: string; hash: string }, opts: { replace: boolean }) => void;
  /** Leave the app for a page it does not serve. */
  load: (href: string, opts: { replace: boolean }) => void;
  /** Read the reader's settings and account again. */
  refreshReader: () => void;
}

/** Sefaria's own sites: this host, or any *.sefaria.org / *.sefaria.org.il host (as ReaderApp._getPathAndRefFromUrl). */
const isSefariaHost = (host: string, here: string) => host === here || /(^|\.)sefaria\.org(\.il)?$/.test(host);

/** What a `sefaria:bootstrap-url` asks for: a navigation in the app, a page load, or nothing. */
export function bootstrapUrlAction(
  detail: unknown,
  here: { href: string; host: string },
): { kind: "navigate"; pathname: string; search: string; hash: string; replace: boolean } | { kind: "load"; href: string; replace: boolean } | null {
  const raw = typeof detail === "string" ? detail : detail && typeof detail === "object" ? (detail as { url?: unknown }).url : undefined;
  if (typeof raw !== "string" || !raw) return null;
  const replace = typeof detail === "object" && !!(detail as { replaceHistory?: unknown }).replaceHistory;
  let url: URL;
  try {
    url = new URL(raw, here.href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!isSefariaHost(url.host, here.host)) return null;
  if (url.host !== here.host || isDjangoPage(url.pathname)) return { kind: "load", href: url.href, replace };
  return { kind: "navigate", pathname: url.pathname, search: url.search, hash: url.hash, replace };
}

/** Listen for the events on `doc` (the page's document); returns the function that stops listening. */
export function installLegacyEvents(doc: Document, targets: LegacyEventTargets): () => void {
  const onBootstrap = (e: Event) => {
    const action = bootstrapUrlAction((e as CustomEvent).detail, { href: doc.location.href, host: doc.location.host });
    if (!action) return;
    if (action.kind === "load") targets.load(action.href, { replace: action.replace });
    else targets.navigate({ pathname: action.pathname, search: action.search, hash: action.hash }, { replace: action.replace });
  };
  const onSettings = () => targets.refreshReader();
  doc.addEventListener(BOOTSTRAP_URL_EVENT, onBootstrap);
  doc.addEventListener(SETTINGS_UPDATED_EVENT, onSettings);
  return () => {
    doc.removeEventListener(BOOTSTRAP_URL_EVENT, onBootstrap);
    doc.removeEventListener(SETTINGS_UPDATED_EVENT, onSettings);
  };
}
