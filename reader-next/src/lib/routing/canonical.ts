/**
 * The canonical origin of the page being rendered, per request: as Django's canonical_url (reader/views.py), the
 * Hebrew site names www.sefaria.org.il and the English site www.sefaria.org. Here the host decides (Django: the interface language,
 * which the .org.il host pins to Hebrew), from the configured origin (PUBLIC_CANONICAL_ORIGIN, src/lib/config.ts) and its Hebrew twin
 * (hebrewSiteOrigin). The same answer on the server (the request's Host, which nginx sets) and in the browser (location.host).
 *
 * @feature PLT-008 Canonical URLs and hreflang
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { CANONICAL_ORIGIN } from "~/lib/config";
import { hebrewSiteOrigin } from "./site-origins";

/** Is this the Hebrew site's host: *.org.il (www.sefaria.org.il) or a "-il.org" twin (preprod's www.sefariapreprod-il.org)? */
export function isHebrewSiteHost(host: string | null | undefined): boolean {
  const name = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  return /\.org\.il$/.test(name) || /-il\.org$/.test(name);
}

/** The canonical origin for a page served on `host`: the Hebrew twin of the configured origin on the Hebrew site, else the configured one. */
export const canonicalOriginForHost = (host: string | null | undefined, configured: string = CANONICAL_ORIGIN): string =>
  isHebrewSiteHost(host) ? hebrewSiteOrigin(configured) : configured;

/** The host the visitor asked for (nginx sets X-Forwarded-Host and Host to it). */
const hostOnServer = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => getRequestHeader("x-forwarded-host")?.split(",")[0]?.trim() || getRequestHeader("host") || "",
);

/** The canonical origin of the page being loaded: call from a route loader (server render and in-app navigation alike). */
export async function pageCanonicalOrigin(): Promise<string> {
  return canonicalOriginForHost(typeof window === "undefined" ? await hostOnServer() : window.location.host);
}
