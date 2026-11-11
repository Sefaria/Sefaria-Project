/**
 * Switching the interface language is a request to `/interface/<english|hebrew>?next=<path>`: it sets the `interfaceLang`
 * cookie (the same cookie the old site uses) and sends the reader back where they were. `next` may only be a path on this
 * site — never another origin (an open redirect would turn the language link into a phishing link).
 *
 * As the old view (reader/views.py `interface_language_redirect`, owner decision 2026-11-10: the cookie exactly as legacy sets it):
 * - the cookie is `interfaceLang=<lang>; Domain=<cookie domain>; Path=/` — a session cookie, no SameSite, no Secure (Django's
 *   set_cookie with only a domain; verified with curl on www.sefaria.org and www.sefaria.org.il). The domain is get_cookie_domain of
 *   the language this host is pinned to (".sefaria.org" on www/voices.sefaria.org, ".sefaria.org.il" on the .il hosts), or of every
 *   language when the host is not pinned (cauldrons); none where there is no common suffix (localhost), so the cookie is host-only.
 * - when the language lives on another domain for this module (www.sefaria.org → www.sefaria.org.il), `next` goes to that domain with
 *   `set-language-cookie`, where LanguageCookieMiddleware (or our src/server/language-domain.ts) sets the cookie on the arrival domain
 *   and, for a signed-in reader, saves the language in their profile.
 * - a host-only `interfaceLang` left by an earlier version of this client would shadow the domain cookie (the browser sends both and
 *   every parser here and in Django keeps the last one, the stale host-only cookie): it is expired in the same response.
 *
 * @feature RTE-034 Language switch URL (/interface)
 * @feature I18-007 Site language toggle in dropdowns
 */
export { safeNext } from "~/lib/auth/utils";
import { safeNext } from "~/lib/auth/utils";
import { EXPIRE_HOST_ONLY_LANG_COOKIE, activeModule, cookieDomain, domainLang, withLanguageParam, type DomainModules } from "~/server/language-domain";

export const isInterfaceLang = (x: string): x is "english" | "hebrew" => x === "english" || x === "hebrew";

const SHORT = { english: "en", hebrew: "he" } as const;
const hostnameOf = (host: string) => (host.startsWith("[") ? host.split("]")[0] + "]" : host.split(":")[0]!).toLowerCase();

/** get_cookie_domain(current_domain_lang(request)): the domain the cookie is set on from this host, or undefined (host-only). */
export function interfaceCookieDomain(host: string, modules: DomainModules | null): string | undefined {
  const pinned = domainLang(host, modules);
  if (pinned) return cookieDomain(pinned, modules);
  // not pinned: the common suffix across every language's hosts (cookieDomain over one merged language)
  const all = Object.values(modules ?? {}).flatMap((m) => Object.values(m));
  return cookieDomain("english", { en: Object.fromEntries([...new Set(all)].map((u, i) => [String(i), u])) });
}

/** The Set-Cookie headers: the legacy cookie, after expiring a host-only one that would shadow it. */
export function interfaceCookies(lang: "english" | "hebrew", domain: string | undefined): string[] {
  const cookie = `interfaceLang=${lang}; ${domain ? `Domain=${domain}; ` : ""}Path=/`;
  return domain ? [EXPIRE_HOST_ONLY_LANG_COOKIE, cookie] : [cookie];
}

/** Where `next` goes: this site, or the language's domain for this module with `set-language-cookie` (add_query_param). */
function target(lang: "english" | "hebrew", next: string, host: string | undefined, modules: DomainModules | null): string {
  if (!host || !modules) return next;
  const domain = modules[SHORT[lang]]?.[activeModule(host, modules)];
  let origin: URL;
  try {
    origin = new URL(domain ?? "");
  } catch {
    return next;
  }
  if (origin.hostname.toLowerCase() === hostnameOf(host)) return next;
  // `next` is a path of this site (safeNext): it cannot change the origin
  const url = new URL(next, origin.origin);
  // add_query_param: the query re-encoded as Django's urlencode does, the parameter appended
  return `${origin.origin}${withLanguageParam(url.pathname, url.search)}${url.hash}`;
}

export function interfaceLanguageResponse(lang: string, nextParam: string | null, where: { host?: string; modules?: DomainModules | null } = {}): Response {
  if (!isInterfaceLang(lang)) return new Response("Unknown interface language", { status: 404 });
  const modules = where.modules ?? null;
  const headers = new Headers({ Location: target(lang, safeNext(nextParam), where.host, modules), "Cache-Control": "no-store" });
  for (const c of interfaceCookies(lang, where.host ? interfaceCookieDomain(where.host, modules) : undefined)) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}
