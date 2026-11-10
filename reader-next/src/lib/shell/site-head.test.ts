import { describe, expect, it } from "vitest";
import { siteHeadLinks, siteHeadMeta } from "./site-head";

// base.html's head on sefaria.org (curl of /texts, 2026-11-10)
describe("the Library's head links and meta", () => {
  it("same origin (the cluster): OpenSearch, the icons and the manifest", () => {
    const links = siteHeadLinks("");
    expect(links.find((l) => l.rel === "search")).toMatchObject({ href: "/static/files/opensearch.xml", title: "Sefaria Search", type: "application/opensearchdescription+xml" });
    expect(links.find((l) => l.rel === "apple-touch-icon")).toMatchObject({ href: "/static/icons/library/apple-touch-icon.png?v=3", sizes: "180x180" });
    expect(links.find((l) => l.rel === "manifest")).toMatchObject({ href: "/site.webmanifest?v=3" });
  });
  it("Django on another origin (local development): absolute icons, no manifest", () => {
    const links = siteHeadLinks("https://www.sefaria.org");
    expect(links.find((l) => l.rel === "shortcut icon")?.href).toBe("https://www.sefaria.org/static/icons/library/favicon.ico?v=3");
    expect(links.some((l) => l.rel === "manifest")).toBe(false);
  });
  it("the app banner, theme colour and the home-screen title in the interface language", () => {
    expect(siteHeadMeta(false)).toContainEqual({ name: "apple-itunes-app", content: "app-id=1163273965" });
    expect(siteHeadMeta(false)).toContainEqual({ name: "theme-color", content: "#18345D" });
    expect(siteHeadMeta(true)).toContainEqual({ name: "apple-mobile-web-app-title", content: "ספרייה" });
  });
});
