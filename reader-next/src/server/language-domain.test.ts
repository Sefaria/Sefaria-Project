import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptLanguageCode,
  activeModule,
  bounceFromProbe,
  cookieDomain,
  domainLang,
  domainModulesFromEnv,
  interfaceFromSignals,
  languageDomainAnswer,
  resetLanguageProbes,
  signedInBounce,
  withHostOnlyLangCookieExpired,
  withLanguageParam,
  type DomainModules,
  type LanguageRequest,
} from "./language-domain";

/** Production's DOMAIN_MODULES (helm config.domainModules with the sefaria.org and sefaria.org.il roots). */
const PROD: DomainModules = {
  en: { library: "https://www.sefaria.org", voices: "https://voices.sefaria.org" },
  he: { library: "https://www.sefaria.org.il", voices: "https://chiburim.sefaria.org.il" },
};
/** A cauldron: one root for both languages, so no host is pinned (Django never bounces there). */
const CAULDRON: DomainModules = {
  en: { library: "https://www.x.cauldron.sefaria.org", voices: "https://voices.x.cauldron.sefaria.org" },
  he: { library: "https://www.x.cauldron.sefaria.org", voices: "https://voices.x.cauldron.sefaria.org" },
};
const CHROME = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";

function req(url: string, opts: { cookie?: string; headers?: Record<string, string>; signedIn?: boolean; method?: string } = {}): LanguageRequest {
  const u = new URL(url);
  const cookies = Object.fromEntries((opts.cookie ?? "").split(";").filter(Boolean).map((c) => c.trim().split("=") as [string, string]));
  return { url: u, method: opts.method ?? "GET", host: u.host, cookies, headers: new Headers({ "user-agent": CHROME, ...opts.headers }), signedIn: !!opts.signedIn };
}
const answer = (r: LanguageRequest, m: DomainModules | null = PROD) => languageDomainAnswer(r, m);
const loc = (a: ReturnType<typeof answer>) => (a instanceof Response ? a.headers.get("location") : a);

// sefaria/system/middleware.py LanguageSettingsMiddleware / LanguageCookieMiddleware, branch by branch
// @feature RTE-059
describe("the language-domain bounce", () => {
  it("the Hebrew interface cookie on sefaria.org goes to sefaria.org.il, with the full path and set-language-cookie", () => {
    const a = answer(req("https://www.sefaria.org/Genesis.1?lang=he&x=a%20b", { cookie: "interfaceLang=hebrew" }));
    expect(a).toBeInstanceOf(Response);
    expect((a as Response).status).toBe(302);
    expect(loc(a)).toBe("https://www.sefaria.org.il/Genesis.1?lang=he&x=a+b&set-language-cookie=");
    expect((a as Response).headers.get("cache-control")).toBe("private, no-store");
  });
  it("the English cookie on sefaria.org.il goes to sefaria.org; the matching cookie stays", () => {
    expect(loc(answer(req("https://www.sefaria.org.il/texts", { cookie: "interfaceLang=english" })))).toBe("https://www.sefaria.org/texts?set-language-cookie=");
    expect(answer(req("https://www.sefaria.org.il/texts", { cookie: "interfaceLang=hebrew" }))).toBeNull();
    expect(answer(req("https://www.sefaria.org/texts", { cookie: "interfaceLang=english" }))).toBeNull();
  });
  it("without the cookie: the country (IL is Hebrew), then Accept-Language", () => {
    expect(loc(answer(req("https://www.sefaria.org/texts", { headers: { "cf-ipcountry": "IL" } })))).toBe("https://www.sefaria.org.il/texts?set-language-cookie=");
    // any other country means English, whatever the browser's languages (the country comes first)
    expect(answer(req("https://www.sefaria.org/texts", { headers: { "cf-ipcountry": "US", "accept-language": "he" } }))).toBeNull();
    expect(loc(answer(req("https://www.sefaria.org.il/texts", { headers: { "cf-ipcountry": "US" } })))).toBe("https://www.sefaria.org/texts?set-language-cookie=");
    expect(loc(answer(req("https://www.sefaria.org/texts", { headers: { "accept-language": "he-IL,he;q=0.9,en;q=0.8" } })))).toBe("https://www.sefaria.org.il/texts?set-language-cookie=");
    expect(answer(req("https://www.sefaria.org/texts"))).toBeNull(); // nothing at all: English
    // the cookie beats the country
    expect(answer(req("https://www.sefaria.org/texts", { cookie: "interfaceLang=english", headers: { "cf-ipcountry": "IL" } }))).toBeNull();
  });
  it("crawlers stay on the domain they asked for", () => {
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1)", "curl/8.4.0", "sefaria-node", "facebookexternalhit/1.1"])
      expect(answer(req("https://www.sefaria.org.il/texts", { cookie: "interfaceLang=english", headers: { "user-agent": ua } }))).toBeNull();
  });
  it("no bounce where the host is not pinned (a cauldron, localhost, no DOMAIN_MODULES) or the path is excluded", () => {
    expect(answer(req("https://www.x.cauldron.sefaria.org/texts", { cookie: "interfaceLang=hebrew" }), CAULDRON)).toBeNull();
    expect(answer(req("http://localhost:3000/texts", { cookie: "interfaceLang=hebrew" }))).toBeNull();
    expect(answer(req("https://www.sefaria.org/texts", { cookie: "interfaceLang=hebrew" }), null)).toBeNull();
    for (const p of ["/api/texts/Genesis.1", "/interface/hebrew?next=/", "/accounts/google/login/callback/", "/_allauth/browser/v1/auth/session", "/static/x.css", "/.well-known/x", "/apple-app-site-association", "/linker.v3.js", "/_serverFn/abc", "/assets/x.js"])
      expect(answer(req(`https://www.sefaria.org${p}`, { cookie: "interfaceLang=hebrew" }))).toBeNull();
    expect(answer(req("https://www.sefaria.org/texts", { cookie: "interfaceLang=hebrew", method: "POST" }))).toBeNull();
  });
  it("never an open redirect: a path starting with // or /\\ is not bounced or cleaned", () => {
    for (const p of ["//evil.com/x", "/\\evil.com"]) {
      const u = new URL(`https://www.sefaria.org.il${p}?set-language-cookie=`);
      expect(u.pathname.startsWith("//")).toBe(true); // the URL parser makes /\ a //
      expect(languageDomainAnswer({ url: u, method: "GET", host: u.host, cookies: {}, headers: new Headers({ "user-agent": CHROME }), signedIn: false }, PROD)).toBeNull();
      const v = new URL(`https://www.sefaria.org${p}`);
      expect(languageDomainAnswer({ url: v, method: "GET", host: v.host, cookies: { interfaceLang: "hebrew" }, headers: new Headers({ "user-agent": CHROME }), signedIn: false }, PROD)).toBeNull();
    }
    // a target with a path of its own: only its origin is used
    const a = answer(req("https://www.sefaria.org.il/texts?set-language-cookie="), { ...PROD, he: { library: "https://www.sefaria.org.il/x/", voices: PROD.he!.voices! } }) as Response;
    expect(a.headers.get("location")).toBe("https://www.sefaria.org.il/texts");
  });
  it("keeps the module: Voices to Voices", () => {
    expect(loc(answer(req("https://voices.sefaria.org/sheets/1", { cookie: "interfaceLang=hebrew" })))).toBe("https://chiburim.sefaria.org.il/sheets/1?set-language-cookie=");
  });
  it("?set-language-cookie: the language of the arrival domain is set as a session cookie on its domain, and the address cleaned", () => {
    const a = answer(req("https://www.sefaria.org.il/Genesis.1?lang=he&set-language-cookie=")) as Response;
    expect(a.status).toBe(302);
    expect(a.headers.get("location")).toBe("https://www.sefaria.org.il/Genesis.1?lang=he");
    // the stale host-only cookie an earlier reader-next left is expired first, then the domain cookie
    expect(a.headers.getSetCookie()).toEqual(["interfaceLang=; Max-Age=0; Path=/", "interfaceLang=hebrew; Domain=.sefaria.org.il; Path=/"]);
    const b = answer(req("https://www.sefaria.org/texts?set-language-cookie")) as Response;
    expect(b.headers.get("location")).toBe("https://www.sefaria.org/texts");
    expect(b.headers.getSetCookie()).toEqual(["interfaceLang=; Max-Age=0; Path=/", "interfaceLang=english; Domain=.sefaria.org; Path=/"]);
    // signed in, Django also saves it in the profile: theirs
    expect(answer(req("https://www.sefaria.org.il/texts?set-language-cookie=", { signedIn: true }))).toBe("django");
  });
  it("a signed-in reader's language is in their profile: Django is asked", () => {
    expect(answer(req("https://www.sefaria.org/texts", { cookie: "interfaceLang=english", signedIn: true }))).toBe("ask-django");
    expect(answer(req("https://www.x.cauldron.sefaria.org/texts", { signedIn: true }), CAULDRON)).toBeNull();
  });
});

describe("the pieces, as Django computes them", () => {
  it("pinned language, module, cookie domain", () => {
    expect(domainLang("www.sefaria.org", PROD)).toBe("english");
    expect(domainLang("chiburim.sefaria.org.il:443", PROD)).toBe("hebrew");
    expect(domainLang("www.x.cauldron.sefaria.org", CAULDRON)).toBeNull();
    expect(domainLang("example.com", PROD)).toBeNull();
    expect(activeModule("voices.sefaria.org", PROD)).toBe("voices");
    expect(activeModule("localhost:3000", PROD)).toBe("library");
    expect(cookieDomain("english", PROD)).toBe(".sefaria.org");
    expect(cookieDomain("hebrew", PROD)).toBe(".sefaria.org.il");
    expect(cookieDomain("english", { en: { library: "http://localhost:8000", voices: "http://voices.localhost:8000" } })).toBeUndefined();
  });
  it("interface signals and Accept-Language", () => {
    expect(interfaceFromSignals(undefined, undefined, "he")).toBe("hebrew");
    expect(interfaceFromSignals("klingon", "IL", "he")).toBe("english"); // a cookie value is taken as it is
    expect(interfaceFromSignals(undefined, "XX", "he")).toBe("english");
    expect(acceptLanguageCode("fr-FR,fr;q=0.9,he;q=0.8,en;q=0.7")).toBe("he");
    expect(acceptLanguageCode("en;q=0.5,he;q=0.9")).toBe("he");
    expect(acceptLanguageCode("fr")).toBe("en");
    // Django's get_language_from_request: "iw" is not a supported code (LANGUAGES = en, he), "*" ends the search
    expect(acceptLanguageCode("iw-IL,iw;q=0.9")).toBe("en");
    expect(acceptLanguageCode("*, he;q=0.5")).toBe("en");
    expect(acceptLanguageCode("fr, *;q=0.8, he;q=0.5")).toBe("en");
    // the django_language cookie comes first
    expect(acceptLanguageCode("en", "he")).toBe("he");
    expect(acceptLanguageCode("he", "xx")).toBe("he");
    expect(acceptLanguageCode(null)).toBe("en");
  });
  it("the query with set-language-cookie, as Python's urlencode writes it", () => {
    expect(withLanguageParam("/Genesis.1", "")).toBe("/Genesis.1?set-language-cookie=");
    expect(withLanguageParam("/search", "?q=a b&q=c")).toBe("/search?q=a+b&q=c&set-language-cookie=");
  });
  it("DOMAIN_MODULES from the environment", () => {
    expect(domainModulesFromEnv({ DOMAIN_MODULES: JSON.stringify(PROD) })).toEqual(PROD);
    expect(domainModulesFromEnv({ DOMAIN_MODULES: "not json" })).toBeNull();
    expect(domainModulesFromEnv({})).toBeNull();
  });
});

describe("a signed-in reader: Django's middleware is asked with a probe", () => {
  beforeEach(() => resetLanguageProbes());
  const signedIn = (cookie = "sessionid=abc") => new Request("https://www.sefaria.org/Genesis.1?lang=he", { headers: { cookie, "user-agent": CHROME } });
  it("a bounce from the probe becomes this address's bounce; asked once per session", async () => {
    const asked: string[] = [];
    const pass = async (r: Request) => {
      asked.push(new URL(r.url).pathname);
      return new Response(null, { status: 302, headers: { location: "https://www.sefaria.org.il/people?set-language-cookie=" } });
    };
    expect(await signedInBounce(signedIn(), pass)).toBe("https://www.sefaria.org.il/Genesis.1?lang=he&set-language-cookie=");
    expect(await signedInBounce(signedIn(), pass)).toBe("https://www.sefaria.org.il/Genesis.1?lang=he&set-language-cookie=");
    expect(asked).toEqual(["/people"]);
  });
  it("Django's ordinary answer means stay; a failure is not remembered", async () => {
    expect(await signedInBounce(signedIn(), async () => new Response(null, { status: 301, headers: { location: "/topics/category/authors" } }))).toBeNull();
    let n = 0;
    const failing = async () => (n++, new Response("", { status: 503 }));
    expect(await signedInBounce(signedIn("sessionid=other"), failing)).toBeNull();
    expect(await signedInBounce(signedIn("sessionid=other"), failing)).toBeNull();
    expect(n).toBe(2);
  });
  it("bounceFromProbe reads only a set-language-cookie redirect", () => {
    const u = new URL("https://www.sefaria.org/x?a=1");
    expect(bounceFromProbe(new Response(null, { status: 302, headers: { location: "https://www.sefaria.org.il/people?set-language-cookie=" } }), u)).toBe("https://www.sefaria.org.il/x?a=1&set-language-cookie=");
    expect(bounceFromProbe(new Response(null, { status: 301, headers: { location: "/topics/category/authors" } }), u)).toBeNull();
    expect(bounceFromProbe(new Response("", { status: 200 }), u)).toBeNull();
  });
});

// A response that sets the domain cookie also expires a stale host-only one (never on a host-only setup)
describe("withHostOnlyLangCookieExpired", () => {
  it("appends the expiry, keeping the status, the location and Django's own cookie", () => {
    const django = new Response(null, { status: 302, headers: [["location", "/texts"], ["set-cookie", "interfaceLang=hebrew; Domain=.sefaria.org; Path=/"]] });
    const r = withHostOnlyLangCookieExpired(django, ".sefaria.org");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/texts");
    expect(r.headers.getSetCookie()).toEqual(["interfaceLang=hebrew; Domain=.sefaria.org; Path=/", "interfaceLang=; Max-Age=0; Path=/"]);
  });
  it("no domain (localhost): unchanged", () => {
    const res = new Response("x");
    expect(withHostOnlyLangCookieExpired(res, undefined)).toBe(res);
  });
});
