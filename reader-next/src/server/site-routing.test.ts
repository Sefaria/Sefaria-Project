import { beforeEach, describe, expect, it } from "vitest";
import { siteRoute, type Render, type RoutingDeps } from "./site-routing";
import { FORCE_NOT_FOUND } from "~/lib/routing/not-found";
import { resetLanguageProbes, type DomainModules } from "./language-domain";

const MODULES: DomainModules = {
  en: { library: "https://www.sefaria.org", voices: "https://voices.sefaria.org" },
  he: { library: "https://www.sefaria.org.il", voices: "https://chiburim.sefaria.org.il" },
};
const CHROME = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";

/** A stand-in Django: answers by path; records what it was asked. */
function django(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const pass = async (r: Request) => {
    const u = new URL(r.url);
    asked.push(u.pathname + u.search);
    const make = routes[u.pathname] ?? (() => new Response("<h1>Page Not Found</h1>", { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }));
    const res = make();
    const h = new Headers(res.headers);
    h.set("x-served-by", "django");
    return new Response(res.body, { status: res.status, headers: h });
  };
  return { pass, asked };
}

/** A stand-in router: our page (200) for the paths it knows, else 404; the forced-not-found render says so; records the contexts. */
function router(known: string[] = []) {
  const renders: (Record<string, unknown> | undefined)[] = [];
  const make = (pathname: string, cookie: string): Render => async (ctx) => {
    renders.push(ctx?.context);
    const forced = ctx?.context?.[FORCE_NOT_FOUND] === true;
    const lang = /interfaceLang=hebrew/.test(cookie) ? "he" : "en";
    if (forced || !known.includes(pathname)) return new Response(`<html lang="${lang}"><main data-reader-not-found>Page Not Found</main></html>`, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response(`<html lang="${lang}"><main>page</main></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
  return { make, renders };
}

function deps(over: Partial<RoutingDeps> & Pick<RoutingDeps, "passThrough">): RoutingDeps {
  return {
    passThroughEnabled: true,
    voicesOrigin: "https://voices.sefaria.org",
    domainModules: MODULES,
    routeOwner: async (p) => (p === "/Genesis.1" || p === "/texts" ? "client" : "django"),
    topicsOwner: async () => "unknown",
    // the API is never needed in these cases; if it is asked, it is down
    fetcher: (async () => new Response("", { status: 502 })) as unknown as typeof fetch,
    ...over,
  };
}

async function route(url: string, d: RoutingDeps, r: ReturnType<typeof router>, init: { cookie?: string; host?: string; ua?: string; method?: string } = {}) {
  const headers = new Headers({ "user-agent": init.ua ?? CHROME, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.host ? { "x-forwarded-host": init.host } : {}) });
  const req = new Request(url, { method: init.method ?? "GET", headers });
  return siteRoute(req, new URL(url).pathname, r.make(new URL(url).pathname, init.cookie ?? ""), d);
}

// @feature RTE-040 @feature RTE-059 @feature RTE-037
describe("siteRoute: the reader's server with Django stubbed", () => {
  beforeEach(() => resetLanguageProbes());

  it("Django 404 → the reader's own 404 page, noindex, Django's cookies kept", async () => {
    const dj = django({ "/no-such-page": () => new Response("<h1>Page Not Found</h1>", { status: 404, headers: { "content-type": "text/html", "set-cookie": "csrftoken=abc; Path=/" } }) });
    const r = router();
    const res = await route("https://www.sefaria.org/no-such-page", deps({ passThrough: dj.pass }), r, { cookie: "interfaceLang=english" });
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-served-by")).toBeNull();
    expect(res.headers.getSetCookie()).toEqual(["csrftoken=abc; Path=/"]);
    expect(await res.text()).toContain("data-reader-not-found");
    expect(r.renders).toEqual([{ [FORCE_NOT_FOUND]: true }]);
    expect(dj.asked).toEqual(["/no-such-page"]); // one Django request, no extra
  });

  it("a Hebrew interface gets the 404 page in Hebrew (the render sees the request's cookie)", async () => {
    const dj = django({});
    const res = await route("https://www.sefaria.org.il/no-such-page", deps({ passThrough: dj.pass }), router(), { cookie: "interfaceLang=hebrew" });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('lang="he"');
  });

  it("Django's page is kept as it is (200, a redirect, an API's 404)", async () => {
    const dj = django({
      "/about": () => new Response("<h1>About</h1>", { status: 200, headers: { "content-type": "text/html" } }),
      "/person/Rashi": () => new Response(null, { status: 301, headers: { location: "/topics/rashi" } }),
      "/api/nothing": () => new Response("{}", { status: 404, headers: { "content-type": "application/json" } }),
    });
    const r = router();
    const en = { cookie: "interfaceLang=english" };
    const about = await route("https://www.sefaria.org/about", deps({ passThrough: dj.pass }), r, en);
    expect([about.status, about.headers.get("x-served-by")]).toEqual([200, "django"]);
    const person = await route("https://www.sefaria.org/person/Rashi", deps({ passThrough: dj.pass }), r, en);
    expect([person.status, person.headers.get("location")]).toEqual([301, "/topics/rashi"]);
    const api = await route("https://www.sefaria.org/api/nothing", deps({ passThrough: dj.pass }), r, en);
    expect([api.status, api.headers.get("x-served-by")]).toEqual([404, "django"]);
    expect(r.renders).toEqual([]); // the router was never asked
  });

  it("our own page renders; our own 404 goes to Django first and stays ours when Django has nothing", async () => {
    const dj = django({});
    const r = router(["/texts"]);
    const page = await route("https://www.sefaria.org/texts", deps({ passThrough: dj.pass }), r, { cookie: "interfaceLang=english" });
    expect(page.status).toBe(200);
    const miss = await route("https://www.sefaria.org/Genesis.1", deps({ passThrough: dj.pass }), r, { cookie: "interfaceLang=english" });
    expect([miss.status, miss.headers.get("x-robots-tag")]).toEqual([404, "noindex"]);
    expect(dj.asked).toEqual(["/Genesis.1"]);
  });

  it("the old redirects and the language bounce answer on the Library host", async () => {
    const dj = django({});
    const d = deps({ passThrough: dj.pass });
    const people = await route("https://www.sefaria.org/people", d, router(), { cookie: "interfaceLang=english" });
    expect([people.status, people.headers.get("location"), people.headers.get("cache-control")]).toEqual([301, "/topics/category/authors", null]);
    const bounce = await route("https://www.sefaria.org/texts", d, router(), { cookie: "interfaceLang=hebrew" });
    expect([bounce.status, bounce.headers.get("location")]).toEqual([302, "https://www.sefaria.org.il/texts?set-language-cookie="]);
    expect(dj.asked).toEqual([]);
  });

  it("a signed-in arrival with ?set-language-cookie goes to Django, and the stale host-only interfaceLang is expired", async () => {
    const dj = django({ "/texts": () => new Response("ok", { status: 200, headers: { "set-cookie": "interfaceLang=hebrew; Domain=.sefaria.org.il; Path=/" } }) });
    const res = await route("https://www.sefaria.org.il/texts?set-language-cookie=", deps({ passThrough: dj.pass }), router(), { cookie: "sessionid=abc; interfaceLang=english", host: "www.sefaria.org.il" });
    expect(dj.asked).toEqual(["/texts?set-language-cookie="]);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toContain("interfaceLang=hebrew; Domain=.sefaria.org.il; Path=/");
    expect(cookies).toContain("interfaceLang=; Max-Age=0; Path=/");
  });

  describe("on the Voices host every new behaviour is skipped: the request goes to Django exactly as before", () => {
    for (const [host, path] of [
      ["voices.sefaria.org", "/texts/recent"],
      ["voices.sefaria.org", "/random/link"],
      ["voices.sefaria.org", "/my/notes"],
      ["voices.sefaria.org", "/people"],
      ["chiburim.sefaria.org.il", "/contributors/someone"],
      ["voices.sefaria.org", "/no-such-page"],
      ["chiburim.sefaria.org.il", "/sheets/1"],
    ] as const) {
      it(`${host}${path}`, async () => {
        const dj = django({ "/my/notes": () => new Response(null, { status: 302, headers: { location: "/my/profile?tab=notes" } }) });
        const r = router();
        // a Hebrew cookie on the English Voices host (and the reverse) would bounce on the Library host
        const cookie = host.startsWith("voices") ? "interfaceLang=hebrew" : "interfaceLang=english";
        const res = await route(`https://${host}${path}`, deps({ passThrough: dj.pass }), r, { cookie, host });
        expect(res.headers.get("x-served-by")).toBe("django");
        expect(res.headers.get("x-robots-tag")).toBeNull(); // Django's 404, not ours
        expect(res.headers.get("location") ?? "").not.toContain("set-language-cookie");
        expect(dj.asked).toEqual([path]);
        expect(r.renders.filter((c) => c?.[FORCE_NOT_FOUND])).toEqual([]);
      });
    }
    it("without pass-through (dev) the Voices host gets no redirect of ours either", async () => {
      const r = router();
      const res = await route("https://voices.sefaria.org/my/notes", deps({ passThrough: async () => new Response(null, { status: 599 }), passThroughEnabled: false }), r, { host: "voices.sefaria.org" });
      expect(res.headers.get("x-served-by")).not.toBe("reader-redirect");
      expect(r.renders.length).toBe(1);
    });
  });
});
