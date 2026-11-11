import { describe, expect, it } from "vitest";
import { siteRoute, type Render, type RoutingDeps } from "~/server/site-routing";
import { routeOwner } from "~/server/route-manifest";
import { isDjangoPage, isLibraryOnlyPage, leavesClient } from "~/lib/routing/django-paths";
import { isStaticPagePath, rendersStaticPage, STATIC_PAGE_NAMES, staticPageName, staticPageOwner } from "./pages";

/** Django stubbed: answers every path with a page of its own (200), records what it was asked. */
function django() {
  const asked: string[] = [];
  const pass = async (r: Request) => {
    const u = new URL(r.url);
    asked.push(u.pathname);
    return new Response("<h1>django</h1>", { status: u.pathname === "/no-such" ? 404 : 200, headers: { "content-type": "text/html", "x-served-by": "django" } });
  };
  return { pass, asked };
}

async function route(url: string, d: ReturnType<typeof django>) {
  const renders: string[] = [];
  const u = new URL(url);
  const render: Render = async () => {
    renders.push(u.pathname);
    return new Response("<main>ours</main>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const deps: RoutingDeps = {
    passThroughEnabled: true,
    passThrough: d.pass,
    voicesOrigin: "https://voices.sefaria.org",
    domainModules: null,
    // the real manifest: the static pages are decided before any name lookup (which would fail here)
    routeOwner: (p) => routeOwner(p, { fetcher: (async () => new Response("", { status: 502 })) as unknown as typeof fetch }),
    topicsOwner: async () => "unknown",
  };
  const res = await siteRoute(new Request(url, { headers: { "x-forwarded-host": u.host } }), u.pathname, render, deps);
  return { res, renders };
}

// @feature STA-001 @feature STA-005 @feature RTE-040
describe("the static pages' routing", () => {
  it("knows every page of sites/sefaria/urls.py (but /updates, the new reader's own page), the pages by language and /digitized-by-sefaria", () => {
    expect(STATIC_PAGE_NAMES).toHaveLength(43 + 2 + 1);
    for (const p of ["about", "ways-to-give", "digitized-by-sefaria", "terms", "linker", "metrics", "cloudflare_site_is_down_he"]) expect(STATIC_PAGE_NAMES).toContain(p);
    expect(staticPageName("/about/")).toBe("about");
    expect(staticPageName("/about/team")).toBeNull();
    expect(isStaticPagePath("/Genesis")).toBe(false);
    // the object's inherited names are not pages
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(staticPageOwner(name, "en"), name).toBeNull();
      expect(rendersStaticPage(name), name).toBe(false);
      expect(isStaticPagePath(`/${name}`), name).toBe(false);
    }
  });

  it("who renders what: content pages and ports here (the English /ways-to-give is a port, the Hebrew one content), the unported pages Django's", () => {
    expect(staticPageOwner("terms", "en")).toBe("content");
    expect(staticPageOwner("mobile", "he")).toBe("port");
    expect(staticPageOwner("ways-to-give", "he")).toBe("content");
    expect(staticPageOwner("ways-to-give", "en")).toBe("port");
    expect(staticPageOwner("educators", "en")).toBe("port");
    expect(staticPageOwner("team", "en")).toBe("content"); // Django's content, its CMS part filled here
    expect(staticPageOwner("products", "he")).toBe("content");
    expect(staticPageOwner("newsletter", "en")).toBe("django");
    expect(rendersStaticPage("ways-to-give")).toBe(true);
    expect(rendersStaticPage("metrics")).toBe(false);
  });

  it("on the Library host this client's pages are its own; the unported ones are Django's (full loads from the app)", () => {
    for (const p of ["/about", "/about/", "/terms", "/privacy-policy", "/linker", "/mobile", "/educators", "/ways-to-give", "/digitized-by-sefaria", "/team", "/jobs", "/products"]) {
      expect(isDjangoPage(p, "www.sefaria.org"), p).toBe(false);
      expect(leavesClient(p, "www.sefaria.org"), p).toBe(false);
    }
    for (const p of ["/newsletter", "/word-by-word", "/metrics", "/random-walk-through-torah", "/contest/"]) {
      expect(isDjangoPage(p, "www.sefaria.org"), p).toBe(true);
      expect(leavesClient(p, "www.sefaria.org"), p).toBe(true);
    }
    // /updates is the new reader's own page, not a static page here, and not Django's on the Library host
    expect(isStaticPagePath("/updates")).toBe(false);
    expect(isDjangoPage("/updates", "www.sefaria.org")).toBe(false);
    // the rest of /linker… stays Django's
    expect(isDjangoPage("/linker.js")).toBe(true);
    expect(isDjangoPage("/linker-editor")).toBe(true);
    expect(isDjangoPage("/linker/x")).toBe(true);
  });

  it("on the Voices host every static page is Django's, as before", () => {
    for (const p of ["/about", "/terms", "/linker", "/mobile", "/team", "/ways-to-give"]) {
      expect(isDjangoPage(p, "voices.sefaria.org"), p).toBe(true);
      expect(leavesClient(p, "chiburim.sefaria.org.il"), p).toBe(true);
    }
    expect(isLibraryOnlyPage("/about")).toBe(true);
  });

  it("the server renders the Library host's pages, with or without the trailing slash, and asks Django nothing", async () => {
    for (const p of ["/about", "/about/", "/terms", "/linker", "/mobile"]) {
      const d = django();
      const { res, renders } = await route(`https://www.sefaria.org${p}`, d);
      expect([res.status, renders, d.asked], p).toEqual([200, [p], []]);
    }
  });

  it("the server hands the unported pages straight to Django, without rendering", async () => {
    for (const p of ["/newsletter", "/word-by-word", "/metrics"]) {
      const d = django();
      const { res, renders } = await route(`https://www.sefaria.org${p}`, d);
      expect([res.headers.get("x-served-by"), renders, d.asked], p).toEqual(["django", [], [p]]);
    }
  });

  it("on the Voices host the server never renders a static page: Django answers, untouched", async () => {
    for (const host of ["voices.sefaria.org", "chiburim.sefaria.org.il"]) {
      for (const p of ["/about", "/terms", "/linker", "/mobile", "/team"]) {
        const d = django();
        const { res, renders } = await route(`https://${host}${p}`, d);
        expect([res.headers.get("x-served-by"), res.status, renders, d.asked], `${host}${p}`).toEqual(["django", 200, [], [p]]);
      }
    }
  });
});
