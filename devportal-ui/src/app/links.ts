// In-portal links go through React Router (PLAN §2.5). Links are plain `<a href>` everywhere (the
// prerendered header, the adopted Markdown body), so one document listener turns clicks on same-origin
// links to portal pages into client-side navigations. Everything else is left to the browser.

/** Paths React Router renders: `/`, `/docs…`, `/reference…`, `/page/<slug>`. Never a file (`.md`, `.txt`). */
const PORTAL_PAGE = /^\/(?:|docs(?:\/[^./]+)*\/?|reference(?:\/[^./]+)*\/?|page\/[^./]+\/?)$/;

export function isPortalPagePath(pathname: string): boolean {
  return PORTAL_PAGE.test(pathname);
}

export interface Navigator {
  navigate: (to: string) => unknown;
}

/** Returns the in-app path for a click that React Router should handle, or null to leave it alone. */
export function clientNavigationTarget(event: MouseEvent, location: Location): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute('download')) return null;
  const target = anchor.getAttribute('target');
  if (target !== null && target !== '' && target !== '_self') return null;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || !isPortalPagePath(url.pathname)) return null;
  // Same page, another fragment: the browser scrolls.
  if (url.pathname === location.pathname && url.search === location.search && url.hash !== '') return null;
  return url.pathname + url.search + url.hash;
}

/** Installs the listener on `doc`; returns a function that removes it. */
export function interceptPortalLinks(doc: Document, router: Navigator): () => void {
  const onClick = (event: MouseEvent) => {
    const to = clientNavigationTarget(event, doc.defaultView?.location ?? window.location);
    if (to === null) return;
    event.preventDefault();
    void router.navigate(to);
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
