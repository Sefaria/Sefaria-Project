/**
 * Where the client finds the API and the rest of the site, decided at RUN time (one image runs in a cauldron, staging and
 * production). Defaults keep local development pointed at www.sefaria.org.
 *
 * Server (environment variables, read in the Node process):
 *  - SEFARIA_API_ORIGIN   the API as the server reaches it — in the cluster the Varnish service ("http://varnish-<env>:8040"), so a
 *                         cached answer never touches Django; a miss goes on to the web pods.
 *  - SEFARIA_API_HOST     the Host header those internal requests carry (Django routes by host: "www.<env>.cauldron.sefaria.org").
 *  - PUBLIC_API_ORIGIN    the API as the BROWSER reaches it; "" means the page's own origin (nginx sends /api/* to Varnish).
 *  - PUBLIC_SITE_ORIGIN   where links to the pages this client does not render (topics, sheets, login…) go; "" = same origin.
 * Browser: the server writes the two PUBLIC_ values into the page (window.__SEFARIA_CONFIG__) before any module runs.
 */
export interface PublicConfig {
  apiOrigin: string;
  siteOrigin: string;
}

const DEFAULT_ORIGIN = "https://www.sefaria.org";
const isServer = typeof window === "undefined";
const env = (k: string): string | undefined => (isServer && typeof process !== "undefined" ? process.env[k] : undefined);

declare global {
  interface Window {
    __SEFARIA_CONFIG__?: Partial<PublicConfig>;
  }
}

/** What the browser is told (also what the server uses for links it renders). */
export const PUBLIC_CONFIG: PublicConfig = isServer
  ? { apiOrigin: env("PUBLIC_API_ORIGIN") ?? DEFAULT_ORIGIN, siteOrigin: env("PUBLIC_SITE_ORIGIN") ?? DEFAULT_ORIGIN }
  : { apiOrigin: window.__SEFARIA_CONFIG__?.apiOrigin ?? DEFAULT_ORIGIN, siteOrigin: window.__SEFARIA_CONFIG__?.siteOrigin ?? DEFAULT_ORIGIN };

/** The API origin for this side: the internal one on the server, the public one in the browser. */
export const API_ORIGIN: string = isServer ? (env("SEFARIA_API_ORIGIN") ?? PUBLIC_CONFIG.apiOrigin) : PUBLIC_CONFIG.apiOrigin;

/** Origin of the old site's pages (topics, sheets, login…): "" when this client is served on the same site. */
export const SITE_ORIGIN: string = PUBLIC_CONFIG.siteOrigin;

/** The inline script that hands the public config to the browser. */
export const configScript = () => `window.__SEFARIA_CONFIG__=${JSON.stringify(PUBLIC_CONFIG).replace(/</g, "\\u003c")};`;
