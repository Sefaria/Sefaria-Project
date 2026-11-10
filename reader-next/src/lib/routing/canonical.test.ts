// @vitest-environment node
// LAUNCH_PLAN T-C08: the canonical origin on the server (PUBLIC_CANONICAL_ORIGIN from the environment) and per host (the Hebrew site
// names www.sefaria.org.il, as Django's canonical_url).
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  delete process.env.PUBLIC_CANONICAL_ORIGIN;
  vi.resetModules();
});

describe("the canonical origin on the server", () => {
  it("comes from PUBLIC_CANONICAL_ORIGIN, and is written into the page for the browser", async () => {
    process.env.PUBLIC_CANONICAL_ORIGIN = "https://www.sefaria.org/";
    const config = await import("~/lib/config");
    expect(config.CANONICAL_ORIGIN).toBe("https://www.sefaria.org");
    expect(config.configScript()).toContain('"canonicalOrigin":"https://www.sefaria.org"');
  });
  it("a value that is not a bare origin falls back to sefaria.org's, and is reported at start", async () => {
    process.env.PUBLIC_CANONICAL_ORIGIN = "https://www.sefaria.org/texts";
    const config = await import("~/lib/config");
    expect(config.CANONICAL_ORIGIN).toBe("https://www.sefaria.org");
    expect(config.serverConfigProblems({ PUBLIC_CANONICAL_ORIGIN: "https://www.sefaria.org/texts" }).join()).toMatch(/PUBLIC_CANONICAL_ORIGIN/);
    expect(config.serverConfigProblems({ PUBLIC_CANONICAL_ORIGIN: "https://www.sefaria.org.il/" })).toEqual([]);
  });
});

describe("per host", () => {
  it("the Hebrew site's hosts name www.sefaria.org.il; every other host the configured origin", async () => {
    const { canonicalOriginForHost, isHebrewSiteHost } = await import("./canonical");
    for (const h of ["www.sefaria.org.il", "sefaria.org.il:443", "WWW.SEFARIA.ORG.IL", "www.sefariapreprod-il.org"]) expect(isHebrewSiteHost(h)).toBe(true);
    for (const h of ["www.sefaria.org", "voices.sefaria.org", "www.x.cauldron.sefaria.org", "localhost:3100", "", null]) expect(isHebrewSiteHost(h)).toBe(false);
    expect(canonicalOriginForHost("www.sefaria.org.il", "https://www.sefaria.org")).toBe("https://www.sefaria.org.il");
    expect(canonicalOriginForHost("www.sefaria.org", "https://www.sefaria.org")).toBe("https://www.sefaria.org");
    expect(canonicalOriginForHost("www.sefariapreprod-il.org", "https://www.sefaria.org")).toBe("https://www.sefaria.org.il");
    // an origin with no Hebrew twin (a test or local one) stays as it is
    expect(canonicalOriginForHost("www.sefaria.org.il", "http://localhost:3100")).toBe("http://localhost:3100");
  });
  it("a page on the Hebrew site names its .org.il address as canonical and og:url; the alternates stay one per language", async () => {
    const head = (await import("~/routes/calendars")).Route.options.head!({ loaderData: { path: "/calendars", canonicalOrigin: "https://www.sefaria.org.il" } } as never) as {
      meta: Record<string, string>[];
      links: Record<string, string>[];
    };
    expect(head.links).toContainEqual({ rel: "canonical", href: "https://www.sefaria.org.il/calendars" });
    expect(head.meta).toContainEqual({ property: "og:url", content: "https://www.sefaria.org.il/calendars" });
    expect(head.links).toContainEqual({ rel: "alternate", href: "https://www.sefaria.org/calendars", hrefLang: "en" });
    expect(head.links).toContainEqual({ rel: "alternate", href: "https://www.sefaria.org.il/calendars", hrefLang: "he" });
  });
});
