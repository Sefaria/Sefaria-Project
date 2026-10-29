// Production server: the built app (dist/server) behind a small Node HTTP server, with the built client files (dist/client) served
// directly. Hashed files under /assets/ are cached for a year; everything else (fonts, images) for a day.
import { serve } from "srvx";
import { serveStatic } from "srvx/static";
import app from "../dist/server/server.js";

const cacheHeaders = async (request, next) => {
  const res = await next();
  if (res && res.status === 200 && !res.headers.has("cache-control")) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/assets/")) res.headers.set("cache-control", "public, max-age=31536000, immutable");
    else if (/\.(woff2?|ttf|otf|svg|png|jpe?g|ico|webp)$/.test(path)) res.headers.set("cache-control", "public, max-age=86400");
  }
  return res;
};

serve({
  port: Number(process.env.PORT) || 3000,
  hostname: process.env.HOST || "0.0.0.0",
  middleware: [cacheHeaders, serveStatic({ dir: new URL("../dist/client", import.meta.url).pathname })],
  fetch: app.fetch,
});
