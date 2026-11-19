/**
 * A page this client does not render answers 404, and in the cluster the server then hands the request to Django (pass-through).
 * That only happens on a full page load: an in-app navigation that ends on a 404 must load the address again from the server.
 * It reached the 404 in the app when the document was loaded at a different address than the one now shown; the server's own 404
 * (the document's address) is final, so this never loops.
 */
export function shouldHandOffToDjango(documentUrl: string | undefined, currentUrl: string): boolean {
  if (!documentUrl) return false;
  const strip = (u: string) => {
    try {
      const x = new URL(u);
      return x.origin + x.pathname + x.search;
    } catch {
      return u;
    }
  };
  return strip(documentUrl) !== strip(currentUrl);
}

/** The address the current document was loaded at (the navigation timing entry), in the browser only. */
export function documentLoadUrl(): string | undefined {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return undefined;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.name;
}
