/**
 * The server entry (TanStack Start's default one, plus one guard), used by `vite dev` and the production build alike.
 *
 * A title may hold a backslash, written `%5C` in the address (`/Judaism's_Life_Changing_Ideas;_…_Matot;_Subject%5CObject`, wiki
 * reader-next _index "Titles may hold / and \"). h3, inside the start handler (H3Event's constructor), runs `decodeURI` on the pathname
 * of the URL object it shares with srvx's NodeRequest: `%5C` becomes `\`, the URL setter turns that into `/`, and `request.url` reached
 * the router as `…Subject/Object`: a 404 (`%2F` survives, being reserved for `decodeURI`). Upstream bug in h3 (it should not mutate
 * `req._url`). Such a request is handed on as a plain Request with its own URL (body and signal kept, so a POST works too); every
 * other request passes untouched. Lane R, 2026-11-10.
 */
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";

const handler = createStartHandler(defaultStreamHandler);

/** A request whose URL holds `%5C`, copied so that nothing the handler does to its URL object changes `request.url`. */
export function withOwnUrl(request: Request): Request {
  if (!/%5c/i.test(request.url)) return request;
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(hasBody ? { body: request.body, duplex: "half" } : {}),
  } as RequestInit);
}

const fetch: RequestHandler<Register> = (request, opts) => handler(withOwnUrl(request), opts);

export default { fetch };
