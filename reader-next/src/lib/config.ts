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
 *  - PUBLIC_CANONICAL_ORIGIN  the absolute origin of canonical and Open Graph URLs (`<link rel="canonical">`, og:url), which must
 *                         never be relative, so not PUBLIC_SITE_ORIGIN (empty in the cluster on purpose). Default (and when unset,
 *                         empty or not an http(s) origin) "https://www.sefaria.org"; the chart sets it (reader.canonicalOrigin). On
 *                         the Hebrew site's host a page names its Hebrew twin (www.sefaria.org.il), as Django: src/lib/routing/canonical.ts.
 *  - PUBLIC_ROOM_URL      the follow-me room server as the browser reaches it ("ws://<lan-ip>:3199" for scripts/dev-room-server.mjs);
 *                         unset = follow runs in an in-browser room shared over BroadcastChannel (tabs of one browser only).
 *  - PUBLIC_LABS          the labs on by default in this deployment, comma-separated ("follow_me,recording"); remote config
 *                         `feature.reader.labs.<name>` overrides it either way (src/lib/labs.ts). Unset = every lab off.
 *  - Analytics (src/lib/analytics), the same settings Django's templates/base.html reads; each is off when unset, so development and
 *    tests send nothing: GOOGLE_TAG_MANAGER_CODE, GOOGLE_GTAG, SIMPLE_ANALYTICS_HOSTNAME ("sefaria.org" in
 *    production), APP_VERSION (gtag's site_version).
 *  - GOOGLE_SSO_CLIENT_ID, APPLE_SSO_CLIENT_ID, RECAPTCHA_PUBLIC_KEY   the sign-in providers' public client IDs and the reCAPTCHA site
 *                         key — the same values Django hands its own pages (reader/views.py user_data). Empty = that provider's
 *                         button is not shown / no captcha, as on the old site.
 * Browser: the server writes the PUBLIC_ values, the analytics settings and the three sign-in keys into the page (window.__SEFARIA_CONFIG__) before any module runs.
 */
import { parseLabs, type LabName } from "~/lib/labs";

export interface AnalyticsConfig {
  gtm: string | null;
  gtag: string | null;
  simpleAnalyticsHost: string | null;
  appVersion: string | null;
}
export interface PublicConfig {
  apiOrigin: string;
  siteOrigin: string;
  /** Absolute origin for canonical and Open Graph URLs (PUBLIC_CANONICAL_ORIGIN): see {@link canonicalUrl}. */
  canonicalOrigin: string;
  analytics: AnalyticsConfig;
  /** The Voices site (sheets, collections, profiles): PUBLIC_VOICES_ORIGIN, "https://voices.<root domain>" in a deployment. */
  voicesOrigin: string;
  googleClientId: string;
  appleClientId: string;
  recaptchaSiteKey: string;
  /** Follow me's room server (PUBLIC_ROOM_URL, ws: or wss:); absent or "" = the in-browser room (src/features/reader-state/follow). */
  roomUrl?: string;
  /** The labs this deployment turns on by default (PUBLIC_LABS); remote config can override each (src/lib/labs.ts). */
  labs?: LabName[];
  /** The Library Assistant (`<lc-chatbot>`): which build to load and which server it talks to (src/lib/assistant/config.ts). */
  assistant: AssistantEnv;
}

/** The Library Assistant's deployment settings, read from the same environment variables Django reads (sefaria/settings.py). */
export interface AssistantEnv {
  /** CHATBOT_API_BASE_URL (Django's default when unset). */
  apiBaseUrl: string;
  /** CHATBOT_VERSION: a preview build to load by default (as `?chatbot_version=` does per reader). */
  version: string | null;
  /** CHATBOT_USE_LOCAL_SCRIPT: the assistant's Vite dev server (http://localhost:5173), as Django's setting. */
  useLocalScript: boolean;
  /** `origin` attribute: "sefaria-<SENTRY_ENVIRONMENT>", as Django sends it. */
  origin: string;
}

const DEFAULT_ORIGIN = "https://www.sefaria.org";
const DEFAULT_VOICES = "https://voices.sefaria.org";
const DEFAULT_CANONICAL = "https://www.sefaria.org";

/** The canonical origin for a configured value: an absolute http(s) origin without its trailing slash, else sefaria.org's. */
export function canonicalOriginFrom(value: string | null | undefined): string {
  const v = (value ?? "").trim().replace(/\/+$/, "");
  return isOrigin(v) ? v : DEFAULT_CANONICAL;
}

/** An absolute http(s) origin and nothing more (no path, query or fragment): what canonicalOriginFrom accepts once a trailing "/" is gone. */
export const isOrigin = (v: string): boolean => /^https?:\/\/[^/?#]+$/.test(v.trim().replace(/\/+$/, ""));
/** Django's CHATBOT_API_BASE_URL default (sefaria/local_settings_example.py, the helm chart). */
const DEFAULT_ASSISTANT_API = "https://chat-dev.sefaria.org/api";
const isServer = typeof window === "undefined";
const env = (k: string): string | undefined => (isServer && typeof process !== "undefined" ? process.env[k] : undefined);

declare global {
  interface Window {
    __SEFARIA_CONFIG__?: Partial<PublicConfig>;
  }
}

const NO_ANALYTICS: AnalyticsConfig = { gtm: null, gtag: null, simpleAnalyticsHost: null, appVersion: null };

/** What the browser is told (also what the server uses for links it renders). */
export const PUBLIC_CONFIG: PublicConfig = isServer
  ? {
      apiOrigin: env("PUBLIC_API_ORIGIN") ?? DEFAULT_ORIGIN,
      siteOrigin: env("PUBLIC_SITE_ORIGIN") ?? DEFAULT_ORIGIN,
      canonicalOrigin: canonicalOriginFrom(env("PUBLIC_CANONICAL_ORIGIN")),
      voicesOrigin: env("PUBLIC_VOICES_ORIGIN") || DEFAULT_VOICES,
      analytics: {
        gtm: env("GOOGLE_TAG_MANAGER_CODE") || null,
        gtag: env("GOOGLE_GTAG") || null,
        simpleAnalyticsHost: env("SIMPLE_ANALYTICS_HOSTNAME") || null,
        appVersion: env("APP_VERSION") || null,
      },
      googleClientId: env("GOOGLE_SSO_CLIENT_ID") ?? "",
      appleClientId: env("APPLE_SSO_CLIENT_ID") ?? "",
      recaptchaSiteKey: env("RECAPTCHA_PUBLIC_KEY") ?? "",
      roomUrl: env("PUBLIC_ROOM_URL") || "",
      labs: parseLabs(env("PUBLIC_LABS")),
      assistant: {
        apiBaseUrl: env("CHATBOT_API_BASE_URL") || DEFAULT_ASSISTANT_API,
        version: env("CHATBOT_VERSION") || null,
        useLocalScript: /^(1|true|yes)$/i.test(env("CHATBOT_USE_LOCAL_SCRIPT") ?? ""),
        origin: `sefaria-${env("SENTRY_ENVIRONMENT") || "local"}`,
      },
    }
  : {
      apiOrigin: window.__SEFARIA_CONFIG__?.apiOrigin ?? DEFAULT_ORIGIN,
      siteOrigin: window.__SEFARIA_CONFIG__?.siteOrigin ?? DEFAULT_ORIGIN,
      canonicalOrigin: canonicalOriginFrom(window.__SEFARIA_CONFIG__?.canonicalOrigin),
      voicesOrigin: window.__SEFARIA_CONFIG__?.voicesOrigin || DEFAULT_VOICES,
      analytics: { ...NO_ANALYTICS, ...window.__SEFARIA_CONFIG__?.analytics },
      googleClientId: window.__SEFARIA_CONFIG__?.googleClientId ?? "",
      appleClientId: window.__SEFARIA_CONFIG__?.appleClientId ?? "",
      recaptchaSiteKey: window.__SEFARIA_CONFIG__?.recaptchaSiteKey ?? "",
      roomUrl: window.__SEFARIA_CONFIG__?.roomUrl || "",
      labs: window.__SEFARIA_CONFIG__?.labs ?? [],
      assistant: { apiBaseUrl: DEFAULT_ASSISTANT_API, version: null, useLocalScript: false, origin: "sefaria-local", ...window.__SEFARIA_CONFIG__?.assistant },
    };

/** The API origin for this side: the internal one on the server, the public one in the browser. */
export const API_ORIGIN: string = isServer ? (env("SEFARIA_API_ORIGIN") ?? PUBLIC_CONFIG.apiOrigin) : PUBLIC_CONFIG.apiOrigin;

/** Origin of the old site's pages (topics, sheets, login…): "" when this client is served on the same site. */
export const SITE_ORIGIN: string = PUBLIC_CONFIG.siteOrigin;

/** Absolute origin of canonical and Open Graph URLs (never ""): PUBLIC_CANONICAL_ORIGIN. */
export const CANONICAL_ORIGIN: string = PUBLIC_CONFIG.canonicalOrigin;

/** The absolute URL a page names as its canonical and og:url: `path` (with its leading "/") on the canonical origin. */
export const canonicalUrl = (path: string, origin: string = CANONICAL_ORIGIN): string => `${origin}${path.startsWith("/") ? path : `/${path}`}`;

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
  // the same test canonicalOriginFrom applies (which would otherwise fall back to sefaria.org's without a word)
  const canonical = e.PUBLIC_CANONICAL_ORIGIN;
  if (canonical !== undefined && canonical !== "" && !isOrigin(canonical))
    problems.push(`PUBLIC_CANONICAL_ORIGIN must be an http(s) origin without a path, not ${JSON.stringify(canonical)}`);
  if (e.SEFARIA_API_HOST !== undefined && !e.SEFARIA_API_ORIGIN) problems.push("SEFARIA_API_HOST is set but SEFARIA_API_ORIGIN is not: the Host rewrite would never apply");
  for (const k of ["SEFARIA_API_TIMEOUT_MS", "SEFARIA_PASS_THROUGH_TIMEOUT_MS"] as const) {
    const v = e[k];
    if (v !== undefined && !(Number(v) > 0)) problems.push(`${k} must be a positive number of milliseconds, not ${JSON.stringify(v)}`);
  }
  return problems;
}
