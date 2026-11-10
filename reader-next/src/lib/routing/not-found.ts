/**
 * The reader's own 404 (T-F28). A path this client does not render is still handed to Django first (it may be one of Django's pages,
 * or a redirect); only when Django also answers 404 does the reader answer — with its own "Page Not Found" page in the new shell, so an
 * opted-in reader who followed a dead link or mistyped an address never lands in the legacy client.
 *
 * How the page is rendered: the request middleware (src/start.ts) asks the router to render the request's own address with the flag
 * below in the request context; the root route sees it in beforeLoad and throws notFound(), so every route's loader is skipped and the
 * root's not-found page is drawn inside the shell.
 *
 * @feature RTE-040 404 and error pages
 */
export const FORCE_NOT_FOUND = "readerNotFound" as const;

/** Did the request middleware ask for the not-found page? (`opts` is a route's beforeLoad options: the start's `serverContext` is in them.) */
export function isForcedNotFound(opts: unknown): boolean {
  const ctx = (opts as { serverContext?: Record<string, unknown> } | null | undefined)?.serverContext;
  return !!ctx && ctx[FORCE_NOT_FOUND] === true;
}

/**
 * Is Django's answer a page-not-found the reader should replace with its own? A 404 to a page read (GET/HEAD, an HTML answer or none),
 * never an API's (JSON) 404 or one for a static file, and never on the Voices host (Voices is out of scope: its answers stay Django's).
 */
export function replaceDjangoNotFound(pathname: string, method: string, res: Response, voicesHost: boolean): boolean {
  if (res.status !== 404 || voicesHost || (method !== "GET" && method !== "HEAD")) return false;
  if (/^\/(?:api|_api|static|_serverFn|assets)(?:[/.]|$)/.test(pathname)) return false;
  const type = res.headers.get("content-type") ?? "";
  return !type || type.includes("text/html");
}

/** The reader's not-found answer as the client rendered it, made a 404 that search engines do not index. */
export function asNotFound(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("x-robots-tag", "noindex");
  headers.delete("content-length");
  // a miss today may be a page tomorrow: revalidated, never kept as is (a signed-in reader's is made private by the cache policy)
  if (!headers.has("cache-control")) headers.set("cache-control", "no-cache");
  return new Response(res.body, { status: 404, statusText: "Not Found", headers });
}

/** Is a router match the not-found page (thrown by its loader or beforeLoad, or no route matched)? For the head and the shell. */
export function isNotFoundMatch(m: { status?: string; error?: unknown; globalNotFound?: boolean }): boolean {
  return m.status === "notFound" || !!m.globalNotFound || (!!m.error && typeof m.error === "object" && (m.error as { isNotFound?: unknown }).isNotFound === true);
}
