import { describe, expect, it, vi } from "vitest";
import { serverConfigProblems } from "./config";

// CODE_REVIEW R-35: a broken configuration fails at start, not on every request
describe("serverConfigProblems", () => {
  it("accepts local development (no settings) and the cluster's settings", () => {
    expect(serverConfigProblems({})).toEqual([]);
    expect(serverConfigProblems({ SEFARIA_API_ORIGIN: "http://varnish-prod:8040", SEFARIA_API_HOST: "www.sefaria.org", PUBLIC_API_ORIGIN: "", PUBLIC_SITE_ORIGIN: "" })).toEqual([]);
  });
  it("a server with only a same-origin API has nothing absolute to call", () => {
    expect(serverConfigProblems({ PUBLIC_API_ORIGIN: "" })[0]).toMatch(/no absolute API origin/);
    expect(serverConfigProblems({ SEFARIA_API_ORIGIN: "" })[0]).toMatch(/no absolute API origin/);
  });
  it("catches relative origins, a host without an origin, and bad timeouts", () => {
    expect(serverConfigProblems({ PUBLIC_SITE_ORIGIN: "/site" }).join()).toMatch(/PUBLIC_SITE_ORIGIN/);
    expect(serverConfigProblems({ SEFARIA_API_HOST: "www.sefaria.org" }).join()).toMatch(/SEFARIA_API_HOST/);
    expect(serverConfigProblems({ SEFARIA_API_TIMEOUT_MS: "soon" }).join()).toMatch(/SEFARIA_API_TIMEOUT_MS/);
  });
});

// LAUNCH_PLAN T-C08: canonical and Open Graph URLs are absolute, from their own origin (PUBLIC_SITE_ORIGIN is "" in the cluster)
describe("the canonical origin", () => {
  it("is the configured absolute origin, else sefaria.org's", async () => {
    const { canonicalOriginFrom, canonicalUrl } = await import("./config");
    expect(canonicalOriginFrom("https://www.sefaria.org.il/")).toBe("https://www.sefaria.org.il");
    expect(canonicalOriginFrom("http://localhost:3000")).toBe("http://localhost:3000");
    for (const bad of [undefined, null, "", "  ", "/", "www.sefaria.org", "https://www.sefaria.org/texts"]) expect(canonicalOriginFrom(bad)).toBe("https://www.sefaria.org");
    expect(canonicalUrl("/calendars", "https://www.sefaria.org")).toBe("https://www.sefaria.org/calendars");
    expect(canonicalUrl("translations/de", "https://www.sefaria.org")).toBe("https://www.sefaria.org/translations/de");
  });
  it("a relative PUBLIC_CANONICAL_ORIGIN is a configuration problem", () => {
    expect(serverConfigProblems({ PUBLIC_CANONICAL_ORIGIN: "www.sefaria.org" }).join()).toMatch(/PUBLIC_CANONICAL_ORIGIN/);
    expect(serverConfigProblems({ PUBLIC_CANONICAL_ORIGIN: "https://www.sefaria.org" })).toEqual([]);
  });
  it("the pages' heads use it although the site origin is empty", async () => {
    vi.resetModules();
    window.__SEFARIA_CONFIG__ = { siteOrigin: "", apiOrigin: "", canonicalOrigin: "https://www.sefaria.org" };
    try {
      const calendars = (await import("~/routes/calendars")).Route.options.head!({ loaderData: { path: "/calendars" } } as never) as { meta: Record<string, string>[]; links: Record<string, string>[] };
      expect(calendars.meta).toContainEqual({ property: "og:url", content: "https://www.sefaria.org/calendars" });
      expect(calendars.links).toContainEqual({ rel: "canonical", href: "https://www.sefaria.org/calendars" });
      expect(calendars.links).toContainEqual({ rel: "alternate", href: "https://www.sefaria.org.il/calendars", hrefLang: "he" });
      const translations = (await import("~/routes/translations.$slug")).Route.options.head!({ params: { slug: "de" } } as never) as { meta: Record<string, string>[] };
      expect(translations.meta).toContainEqual({ property: "og:url", content: "https://www.sefaria.org/translations/de" });
    } finally {
      delete window.__SEFARIA_CONFIG__;
      vi.resetModules();
    }
  });
});
