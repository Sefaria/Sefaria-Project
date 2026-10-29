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
 *  - Analytics (src/lib/analytics), the same settings Django's templates/base.html reads; each is off when unset, so development and
 *    tests send nothing: GOOGLE_TAG_MANAGER_CODE, GOOGLE_GTAG, CLIENT_SENTRY_DSN, SIMPLE_ANALYTICS_HOSTNAME ("sefaria.org" in
 *    production), APP_VERSION (gtag's site_version, Sentry's release).
 *  - GOOGLE_SSO_CLIENT_ID, APPLE_SSO_CLIENT_ID, RECAPTCHA_PUBLIC_KEY   the sign-in providers' public client IDs and the reCAPTCHA site
 *                         key — the same values Django hands its own pages (reader/views.py user_data). Empty = that provider's
 *                         button is not shown / no captcha, as on the old site.
 * Browser: the server writes the PUBLIC_ values, the analytics settings and the three sign-in keys into the page (window.__SEFARIA_CONFIG__) before any module runs.
 */
export interface AnalyticsConfig {
  gtm: string | null;
  gtag: string | null;
  sentryDsn: string | null;
  simpleAnalyticsHost: string | null;
  appVersion: string | null;
}
export interface PublicConfig {
  apiOrigin: string;
  siteOrigin: string;
  analytics: AnalyticsConfig;
  /** The Voices site (sheets, collections, profiles): PUBLIC_VOICES_ORIGIN, "https://voices.<root domain>" in a deployment. */
  voicesOrigin: string;
  googleClientId: string;
  appleClientId: string;
  recaptchaSiteKey: string;
}

const DEFAULT_ORIGIN = "https://www.sefaria.org";
const DEFAULT_VOICES = "https://voices.sefaria.org";
const isServer = typeof window === "undefined";
const env = (k: string): string | undefined => (isServer && typeof process !== "undefined" ? process.env[k] : undefined);

declare global {
  interface Window {
    __SEFARIA_CONFIG__?: Partial<PublicConfig>;
  }
}

const NO_ANALYTICS: AnalyticsConfig = { gtm: null, gtag: null, sentryDsn: null, simpleAnalyticsHost: null, appVersion: null };

/** What the browser is told (also what the server uses for links it renders). */
export const PUBLIC_CONFIG: PublicConfig = isServer
  ? {
      apiOrigin: env("PUBLIC_API_ORIGIN") ?? DEFAULT_ORIGIN,
      siteOrigin: env("PUBLIC_SITE_ORIGIN") ?? DEFAULT_ORIGIN,
      voicesOrigin: env("PUBLIC_VOICES_ORIGIN") || DEFAULT_VOICES,
      analytics: {
        gtm: env("GOOGLE_TAG_MANAGER_CODE") || null,
        gtag: env("GOOGLE_GTAG") || null,
        sentryDsn: env("CLIENT_SENTRY_DSN") || null,
        simpleAnalyticsHost: env("SIMPLE_ANALYTICS_HOSTNAME") || null,
        appVersion: env("APP_VERSION") || null,
      },
      googleClientId: env("GOOGLE_SSO_CLIENT_ID") ?? "",
      appleClientId: env("APPLE_SSO_CLIENT_ID") ?? "",
      recaptchaSiteKey: env("RECAPTCHA_PUBLIC_KEY") ?? "",
    }
  : {
      apiOrigin: window.__SEFARIA_CONFIG__?.apiOrigin ?? DEFAULT_ORIGIN,
      siteOrigin: window.__SEFARIA_CONFIG__?.siteOrigin ?? DEFAULT_ORIGIN,
      voicesOrigin: window.__SEFARIA_CONFIG__?.voicesOrigin || DEFAULT_VOICES,
      analytics: { ...NO_ANALYTICS, ...window.__SEFARIA_CONFIG__?.analytics },
      googleClientId: window.__SEFARIA_CONFIG__?.googleClientId ?? "",
      appleClientId: window.__SEFARIA_CONFIG__?.appleClientId ?? "",
      recaptchaSiteKey: window.__SEFARIA_CONFIG__?.recaptchaSiteKey ?? "",
    };

/** The API origin for this side: the internal one on the server, the public one in the browser. */
export const API_ORIGIN: string = isServer ? (env("SEFARIA_API_ORIGIN") ?? PUBLIC_CONFIG.apiOrigin) : PUBLIC_CONFIG.apiOrigin;

/** Origin of the old site's pages (topics, sheets, login…): "" when this client is served on the same site. */
export const SITE_ORIGIN: string = PUBLIC_CONFIG.siteOrigin;

/** The sign-in providers' public keys (empty when not configured). */
export const SSO_CONFIG = {
  googleClientId: PUBLIC_CONFIG.googleClientId,
  appleClientId: PUBLIC_CONFIG.appleClientId,
  recaptchaSiteKey: PUBLIC_CONFIG.recaptchaSiteKey,
};

/** The inline script that hands the public config to the browser. */
export const configScript = () => `window.__SEFARIA_CONFIG__=${JSON.stringify(PUBLIC_CONFIG).replace(/</g, "\\u003c")};`;

/**
 * Problems with the server's configuration, checked once at start (CODE_REVIEW R-35): the server must reach the API at an absolute
 * http(s) origin — an empty SEFARIA_API_ORIGIN with a same-origin PUBLIC_API_ORIGIN ("") gave relative URLs on the server, which
 * fail on every request. Pure, so it can be tested; src/start.ts decides what to do with the answer.
 */
export function serverConfigProblems(e: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const absolute = (v: string) => /^https?:\/\/[^/]+/.test(v);
  const apiForServer = e.SEFARIA_API_ORIGIN ?? e.PUBLIC_API_ORIGIN ?? DEFAULT_ORIGIN;
  if (!absolute(apiForServer)) problems.push(`the server has no absolute API origin (SEFARIA_API_ORIGIN=${JSON.stringify(e.SEFARIA_API_ORIGIN)}, PUBLIC_API_ORIGIN=${JSON.stringify(e.PUBLIC_API_ORIGIN)})`);
  for (const k of ["PUBLIC_API_ORIGIN", "PUBLIC_SITE_ORIGIN", "PUBLIC_VOICES_ORIGIN"] as const) {
    const v = e[k];
    if (v !== undefined && v !== "" && !absolute(v)) problems.push(`${k} must be "" (this site) or an absolute http(s) origin, not ${JSON.stringify(v)}`);
  }
  if (e.SEFARIA_API_HOST !== undefined && !e.SEFARIA_API_ORIGIN) problems.push("SEFARIA_API_HOST is set but SEFARIA_API_ORIGIN is not: the Host rewrite would never apply");
  for (const k of ["SEFARIA_API_TIMEOUT_MS", "SEFARIA_PASS_THROUGH_TIMEOUT_MS"] as const) {
    const v = e[k];
    if (v !== undefined && !(Number(v) > 0)) problems.push(`${k} must be a positive number of milliseconds, not ${JSON.stringify(v)}`);
  }
  return problems;
}
