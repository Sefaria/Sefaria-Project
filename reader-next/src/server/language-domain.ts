/**
 * The language-domain bounce: what Django's LanguageCookieMiddleware and LanguageSettingsMiddleware
 * (sefaria/system/middleware.py, sefaria/utils/domains_and_languages.py) do to a page request, done here for the page requests this
 * server answers itself. Every other request goes to Django, whose middleware does it.
 *
 * Django, per request (not /api/, /_api/, /interface/, /accounts/, /_allauth/, /linker*.js, /apple-app-site-association, /.well-known/,
 * /static/):
 *  1. `?set-language-cookie` on a domain pinned to a language (LanguageCookieMiddleware): 302 to the same path on that language's
 *     domain for the active module, without the parameter, setting the session cookie `interfaceLang=<the domain's language>` on the
 *     language's cookie domain; for a signed-in reader it also saves the language in the profile.
 *  2. The interface language: a signed-in reader's profile setting `interface_language`, else the `interfaceLang` cookie, else
 *     Cloudflare's `cf-ipcountry`, else the Accept-Language match (en / he), else English. "IL", "he", "he-il" mean Hebrew; anything
 *     but english/hebrew means English.
 *  3. When the host is pinned to a language (exactly one language's DOMAIN_MODULES names it) and that is not the reader's: crawlers
 *     (the user agents below) stay; anyone else gets a 302 to the reader's language's domain for the same module, with the full path
 *     and `set-language-cookie` added to the query — unless that domain is this host (local and cauldron settings).
 *
 * Here: steps 1–3 for signed-out readers, from DOMAIN_MODULES (the same JSON Django reads; without it nothing is pinned and nothing
 * happens, as in Django). A signed-in reader's language is in their profile, which this server cannot read: for them Django is asked
 * (a cheap probe, see languageProbe in src/start.ts), and step 1's profile write is Django's (the request is passed through).
 *
 * @feature RTE-059 Language-domain redirect
 */

export type Lang = "english" | "hebrew";
/** Django's DOMAIN_MODULES: { "en": { "library": "https://www.sefaria.org", "voices": "https://voices.sefaria.org" }, "he": {...} } */
export type DomainModules = Record<string, Record<string, string>>;

let parsedEnv: DomainModules | null | undefined;
/** DOMAIN_MODULES from the environment (the JSON Django's local settings read), or null when unset or unreadable. */
export function domainModulesFromEnv(env?: Record<string, string | undefined>): DomainModules | null {
  if (!env) {
    // read once per process: the environment does not change while the server runs
    if (parsedEnv === undefined) parsedEnv = domainModulesFromEnv(typeof process !== "undefined" ? process.env : {});
    return parsedEnv;
  }
  const raw = env.DOMAIN_MODULES;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as DomainModules) : null;
  } catch {
    return null;
  }
}

const EXCLUDED = ["/linker.js", "/linker.v2.js", "/linker.v3.js", "/api/", "/_api/", "/interface/", "/accounts/", "/_allauth/", "/apple-app-site-association", "/.well-known/", "/static/"];
/** This server's own files and endpoints: never pages. */
const OWN = ["/_serverFn/", "/assets/", "/@", "/__", "/healthz-reader", "/fonts/", "/img/", "/brand/", "/icons/", "/favicon"];
const NO_REDIRECT_AGENTS = ["Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider", "YandexBot", "Facebot", "facebookexternalhit", "ia_archiver", "Sogou", "python-request", "curl", "Wget", "sefaria-node", "Sefaria/"];

export const isLanguageExcluded = (pathname: string) => EXCLUDED.some((p) => pathname.startsWith(p)) || OWN.some((p) => pathname.startsWith(p));

const hostnameOf = (host: string) => (host.startsWith("[") ? host.split("]")[0] + "]" : host.split(":")[0]!).toLowerCase();
const urlHostname = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
};
const short = (l: Lang) => (l === "hebrew" ? "he" : "en");
const long = (code: string): Lang | null => (code === "he" ? "hebrew" : code === "en" ? "english" : null);

/** current_domain_lang: the language this host is pinned to, or null (not listed, or listed under several languages). */
export function domainLang(host: string, modules: DomainModules | null): Lang | null {
  if (!modules) return null;
  const name = hostnameOf(host);
  const langs = Object.entries(modules).filter(([, mods]) => Object.values(mods).some((u) => urlHostname(u) === name)).map(([code]) => code);
  return langs.length === 1 ? long(langs[0]!) : null;
}

/** ModuleMiddleware: the module whose domain is this host, else the Library. */
export function activeModule(host: string, modules: DomainModules | null): string {
  const name = hostnameOf(host);
  for (const mods of Object.values(modules ?? {})) for (const [m, u] of Object.entries(mods)) if (urlHostname(u) === name) return m;
  return "library";
}

/** get_cookie_domain: the common suffix of a language's module hosts (".sefaria.org"), or undefined. */
export function cookieDomain(lang: Lang, modules: DomainModules | null): string | undefined {
  const hostnames = Object.values(modules?.[short(lang)] ?? {})
    .map(urlHostname)
    .filter((h): h is string => !!h && !h.includes("localhost") && !/^\d+\.\d+\.\d+\.\d+$/.test(h));
  if (hostnames.length < 2) return undefined;
  let common = hostnames[0]!;
  for (const h of hostnames.slice(1)) {
    while (common && h !== common && !h.endsWith(`.${common}`)) common = common.includes(".") ? common.split(".").slice(1).join(".") : "";
    if (!common) return undefined;
  }
  const d = `.${common}`;
  return d.split(".").length - 1 >= 2 ? d : undefined;
}

/**
 * Expires a host-only `interfaceLang`. An earlier version of this client set the cookie without a Domain;
 * the browser then sends both it and the domain cookie Django sets, and every parser here and in Django keeps the last, which is the
 * stale host-only one (cookies of one path are ordered by creation, and replacing a cookie keeps its creation time): the switch looks
 * stuck. Sent with every response that sets the domain cookie; it never touches the domain cookie (another cookie: no Domain).
 */
export const EXPIRE_HOST_ONLY_LANG_COOKIE = "interfaceLang=; Max-Age=0; Path=/";

/** `res` with the stale host-only cookie expired too, when the cookie is set on a domain from this host (else unchanged). */
export function withHostOnlyLangCookieExpired(res: Response, domain: string | undefined): Response {
  if (!domain) return res;
  const headers = new Headers(res.headers);
  headers.append("set-cookie", EXPIRE_HOST_ONLY_LANG_COOKIE);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Django's LocaleMiddleware (get_language_from_request) for LANGUAGES = (en, he): the `django_language` cookie when it names a supported
 * language, else the Accept-Language entries by quality — "*" ends the search, "he-IL" / "en-US" match through their generic code
 * (get_supported_language_variant), anything else ("iw", "fr") is skipped — else LANGUAGE_CODE, "en".
 */
export function acceptLanguageCode(header: string | null | undefined, djangoLanguageCookie?: string): "en" | "he" {
  const supported = (code: string | undefined): "en" | "he" | null => {
    const base = (code ?? "").toLowerCase().split("-")[0];
    return base === "he" || base === "en" ? base : null;
  };
  const fromCookie = supported(djangoLanguageCookie);
  if (fromCookie) return fromCookie;
  const prefs = (header ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag: (tag ?? "").trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((p) => p.tag && p.q > 0 && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const p of prefs) {
    if (p.tag === "*") break;
    const code = supported(p.tag);
    if (code) return code;
  }
  return "en";
}

/** _interface_from_request_signals: the cookie, else cf-ipcountry, else the Accept-Language match. */
export function interfaceFromSignals(cookieLang: string | undefined, country: string | null | undefined, acceptLanguage: string | null | undefined, djangoLanguage?: string): Lang {
  let i: string = cookieLang || country || acceptLanguageCode(acceptLanguage, djangoLanguage) || "english";
  if (i === "IL" || i === "he" || i === "he-il") i = "hebrew";
  return i === "hebrew" ? "hebrew" : "english";
}

/** Python's urlencode (quote_plus) of one key/value. */
const plus = (s: string) => encodeURIComponent(s).replace(/%20/g, "+").replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
/** add_query_param(path, "set-language-cookie"): the query re-encoded with the parameter (empty value) appended. */
export function withLanguageParam(pathname: string, search: string): string {
  const pairs = [...new URLSearchParams(search)].map(([k, v]) => `${plus(k)}=${plus(v)}`);
  pairs.push("set-language-cookie=");
  return `${pathname}?${pairs.join("&")}`;
}

export interface LanguageRequest {
  url: URL;
  method: string;
  /** the host the visitor asked for */
  host: string;
  cookies: Record<string, string>;
  headers: Headers;
  signedIn: boolean;
}

/**
 * What the request gets before any page: a redirect (Response), "django" (only Django can answer it: a signed-in reader's
 * set-language-cookie, which writes the profile), "ask-django" (a signed-in reader on a pinned host: the language is in the profile),
 * or null (render as usual).
 */
export function languageDomainAnswer(req: LanguageRequest, modules: DomainModules | null): Response | "django" | "ask-django" | null {
  const { url, host } = req;
  if ((req.method !== "GET" && req.method !== "HEAD") || isLanguageExcluded(url.pathname)) return null;
  // a path starting with two slashes (or a slash and a backslash) would make a Location on another site: never redirect one
  if (/^\/[/\\]/.test(url.pathname)) return null;
  const pinned = domainLang(host, modules);
  if (!pinned) return null;
  const module = activeModule(host, modules);
  // LanguageCookieMiddleware
  if (url.searchParams.has("set-language-cookie")) {
    if (req.signedIn) return "django";
    const target = modules?.[short(pinned)]?.[module];
    if (target) {
      const params = new URLSearchParams(url.search);
      params.delete("set-language-cookie");
      const rest = [...params].map(([k, v]) => `${plus(k)}=${plus(v)}`).join("&");
      // built as a string on the target's origin: the path can never change the host
      const location = `${new URL(target).origin}${url.pathname}${rest ? `?${rest}` : ""}`;
      const domain = cookieDomain(pinned, modules);
      return new Response(null, {
        status: 302,
        headers: [
          ["location", location],
          // the stale host-only cookie first (another cookie, so the order does not matter), then Django's
          ...(domain ? [["set-cookie", EXPIRE_HOST_ONLY_LANG_COOKIE] as [string, string]] : []),
          ["set-cookie", `interfaceLang=${pinned}; ${domain ? `Domain=${domain}; ` : ""}Path=/`],
          ["content-type", "text/html; charset=utf-8"],
          ["cache-control", "private, no-store"],
        ],
      });
    }
  }
  if (req.signedIn) return "ask-django";
  const lang = interfaceFromSignals(req.cookies.interfaceLang, req.headers.get("cf-ipcountry"), req.headers.get("accept-language"), req.cookies.django_language);
  if (lang === pinned) return null;
  const agent = req.headers.get("user-agent") ?? "";
  if (NO_REDIRECT_AGENTS.some((b) => agent.includes(b))) return null;
  const target = modules?.[short(lang)]?.[module];
  const targetHost = target ? urlHostname(target) : null;
  if (!target || !targetHost || targetHost === hostnameOf(host)) return null;
  return languageRedirect(new URL(target).origin + withLanguageParam(url.pathname, url.search));
}

/** Django's redirect(): a 302 with an empty body. Never kept by a shared cache: it depends on the cookie, the country, the languages. */
export const languageRedirect = (location: string) =>
  new Response(null, { status: 302, headers: { location, "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", vary: "Cookie, Accept-Language, CF-IPCountry, User-Agent" } });

/**
 * The probe for a signed-in reader (the language is in their profile): Django's answer to a cheap page of its own, /people (a fixed
 * redirect), with the reader's cookie and headers. Its middleware runs before the view: a Location carrying `set-language-cookie` is the
 * bounce, which is made the request's own address; anything else means stay. Null: stay.
 */
export function bounceFromProbe(probe: Response, url: URL): string | null {
  if (probe.status < 300 || probe.status >= 400) return null;
  const loc = probe.headers.get("location");
  if (!loc || !/[?&]set-language-cookie(?:=|&|$)/.test(loc)) return null;
  try {
    const target = new URL(loc);
    return target.origin + withLanguageParam(url.pathname, url.search);
  } catch {
    return null;
  }
}
export const LANGUAGE_PROBE_PATH = "/people";

const PROBE_TTL_MS = 5 * 60_000;
const PROBE_MAX = 5000;
const probes = new Map<string, { at: number; to: string | null }>();

/**
 * A signed-in reader on a pinned host: does Django bounce them (their profile's language)? Asked once per session, host and signals
 * for 5 minutes. `pass` hands a request to Django (src/server/pass-through.ts passThrough). Returns the redirect's Location, or null.
 */
export async function signedInBounce(request: Request, pass: (r: Request) => Promise<Response>, now = Date.now()): Promise<string | null> {
  const url = new URL(request.url);
  const h = request.headers;
  const session = /(?:^|;\s*)sessionid=([^;]*)/.exec(h.get("cookie") ?? "")?.[1] ?? "";
  const lang = /(?:^|;\s*)interfaceLang=([^;]*)/.exec(h.get("cookie") ?? "")?.[1] ?? "";
  const key = [session, h.get("x-forwarded-host") ?? h.get("host") ?? url.host, lang, h.get("cf-ipcountry") ?? "", h.get("accept-language") ?? "", h.get("user-agent") ?? ""].join("\n");
  const hit = probes.get(key);
  let origin: string | null;
  if (hit && now - hit.at < PROBE_TTL_MS) origin = hit.to;
  else {
    const headers = new Headers(h);
    const probe = await pass(new Request(new URL(LANGUAGE_PROBE_PATH, url).href, { method: "GET", headers }));
    await probe.body?.cancel().catch(() => undefined);
    // a failure (5xx) is not an answer: stay, and ask again next time
    if (probe.status >= 500) return null;
    const to = bounceFromProbe(probe, url);
    origin = to ? new URL(to).origin : null;
    if (probes.size >= PROBE_MAX) probes.delete(probes.keys().next().value as string);
    probes.set(key, { at: now, to: origin });
  }
  return origin ? origin + withLanguageParam(url.pathname, url.search) : null;
}

/** Test helper. */
export const resetLanguageProbes = () => probes.clear();
