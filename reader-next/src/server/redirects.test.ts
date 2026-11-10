import { describe, expect, it } from "vitest";
import { fixedRedirect, randomLinkRedirect } from "./redirects";

const loc = (r: Response | null) => [r?.status, r?.headers.get("location")];

// Each checked against www.sefaria.org on 2026-11-10 (curl -sI): same status, same Location.
// @feature RTE-037 @feature RTE-012 @feature RTE-015
describe("redirects answered by the reader's server (T-F26)", () => {
  it("as Django answers them", () => {
    expect(loc(fixedRedirect("/people", "GET"))).toEqual([301, "/topics/category/authors"]);
    expect(loc(fixedRedirect("/people/", "GET"))).toEqual([301, "/topics/category/authors"]);
    expect(loc(fixedRedirect("/people/Talmud", "GET"))).toEqual([301, "/topics/category/talmudic-figures"]);
    expect(loc(fixedRedirect("/people/Talmud/", "HEAD"))).toEqual([301, "/topics/category/talmudic-figures"]);
    expect(loc(fixedRedirect("/texts/recent", "GET"))).toEqual([301, "/texts/history"]);
    expect(loc(fixedRedirect("/texts/recent/", "GET"))).toEqual([301, "/texts/history"]);
    expect(loc(fixedRedirect("/contributors/foo", "GET"))).toEqual([301, "/profile/foo"]);
    expect(loc(fixedRedirect("/contributors/foo/2", "GET"))).toEqual([301, "/profile/foo"]);
  });
  it("/my/notes goes to this client's notes page (deliberate: Django sends it to the Voices profile or to login)", () => {
    expect(loc(fixedRedirect("/my/notes", "GET"))).toEqual([302, "/texts/notes"]);
    expect(fixedRedirect("/my/notes", "GET")!.headers.get("cache-control")).toBe("private, no-store");
  });
  it("leaves the rest to Django", () => {
    for (const p of ["/people/Rashi", "/person/Rashi", "/random", "/community", "/contributors/foo/bar", "/contributors/foo/", "/my/profile", "/texts/recently"]) expect(fixedRedirect(p, "GET")).toBeNull();
    expect(fixedRedirect("/people", "POST")).toBeNull();
  });
  it("/random/link: the ref the API's random redirect names, as a 302", async () => {
    const api = (async (url: string) => {
      expect(url).toMatch(/\/api\/texts\/random$/);
      return new Response(null, { status: 302, headers: { location: "/api/texts/II%20Chronicles%2031:8?commentary=0&context=0" } });
    }) as unknown as typeof fetch;
    expect(loc((await randomLinkRedirect("/random/link", "GET", api)) as Response)).toEqual([302, "/II%20Chronicles%2031:8"]);
    expect(await randomLinkRedirect("/random", "GET", api)).toBeNull();
    const down = (async () => new Response("", { status: 502 })) as unknown as typeof fetch;
    expect(await randomLinkRedirect("/random/link", "GET", down)).toBe("fallback");
    const fails = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
    expect(await randomLinkRedirect("/random/link", "GET", fails)).toBe("fallback");
  });
});
