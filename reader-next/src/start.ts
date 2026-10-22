import { createMiddleware, createStart } from "@tanstack/react-start";
import { installInternalApiFetch } from "./server/internal-fetch";
import { isDjangoPath, passResetLink, passThrough, passThroughEnabled, resetLinkUid } from "./server/pass-through";

installInternalApiFetch();

/** `/healthz` for the cluster's probes, and the hand-over to Django of every page this client does not render. */
const siteRouting = createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => {
  if (pathname === "/healthz-reader") return new Response("ok", { headers: { "content-type": "text/plain" } });
  if (!passThroughEnabled()) return next();
  if (isDjangoPath(pathname, request.method)) return passThrough(request);
  const resetUid = request.method === "GET" ? resetLinkUid(pathname) : null;
  if (resetUid) return passResetLink(request, resetUid);
  const result = await next();
  return result.response.status === 404 ? passThrough(request) : result;
});

export const startInstance = createStart(() => ({ requestMiddleware: [siteRouting] }));
