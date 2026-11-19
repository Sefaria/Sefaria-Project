/**
 * Before a navigation inside the app shows a static page, its stylesheets are fetched, so the page does not draw unstyled first (the
 * route's head adds the <link>s as it renders; from the cache they apply at once). On the server's page they are in the head already.
 * Never waits long: a stylesheet that does not arrive in time is left to load as the page shows.
 */
export function preloadStylesheets(hrefs: readonly string[], timeoutMs = 3000): Promise<void> {
  if (typeof document === "undefined" || !hrefs.length) return Promise.resolve();
  const loaded = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
  const waits = hrefs
    .filter((href) => !loaded.has(new URL(href, document.baseURI).href))
    .map(
      (href) =>
        new Promise<void>((resolve) => {
          const link = document.createElement("link");
          link.rel = "preload";
          link.as = "style";
          link.href = href;
          link.onload = link.onerror = () => resolve();
          document.head.appendChild(link);
        }),
    );
  return Promise.race([Promise.all(waits).then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
