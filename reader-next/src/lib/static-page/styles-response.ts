import { LEGACY_STATIC_CSS_HASH } from "./legacy-css-hash.gen";

/** The address of the scoped legacy stylesheet (src/routes/static-page-styles.$.ts), named by its content's hash. */
export const LEGACY_STATIC_CSS_HREF = `/static-page-styles/legacy.${LEGACY_STATIC_CSS_HASH}.css`;

/**
 * The stylesheet's answer: at its current address immutable for a year; at any other `legacy.<hash>.css` (a page rendered before a
 * deploy) today's stylesheet, kept briefly; anything else 404. The stylesheet (150 kB of text) is loaded on the server only.
 */
export async function staticPageStylesResponse(name: string): Promise<Response> {
  const m = /^legacy\.([0-9a-f]{8})\.css$/.exec(name);
  if (!m) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const { LEGACY_STATIC_CSS } = await import("./legacy-css.gen");
  const current = m[1] === LEGACY_STATIC_CSS_HASH;
  return new Response(LEGACY_STATIC_CSS, {
    headers: { "content-type": "text/css; charset=utf-8", "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=300" },
  });
}
