import { describe, expect, it } from "vitest";
import { isDjangoPath, passesToDjango, passResetLink, requestHost, resetLinkUid, setPasswordPath, trailingSlashRedirect } from "./pass-through";

describe("isDjangoPath (PLT deployment: which requests go to Django)", () => {
  it("sends Django's own sections through", () => {
    for (const p of ["/api/texts/Genesis.1", "/logout", "/accounts/apple/login/", "/_allauth/browser/v1/auth/session", "/topics", "/topics/light", "/sheets/123", "/static/js/x.js", "/profile/me", "/admin/", "/sefaria.js"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(true);
    }
  });
  it("keeps reader and library pages here", () => {
    for (const p of ["/", "/login", "/login/", "/register", "/password/reset/confirm/MTI/set-password/", "/texts", "/texts/Tanakh", "/Genesis.1", "/Genesis.1.1-5", "/search", "/Rashi_on_Genesis.1.1", "/topicsfoo", "/apis"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(false);
    }
  });
  it("sends every write through, whatever the path", () => {
    expect(isDjangoPath("/Genesis.1", "POST")).toBe(true);
    expect(isDjangoPath("/", "DELETE")).toBe(true);
    expect(isDjangoPath("/Genesis.1", "HEAD")).toBe(false);
  });
});

// @feature ACC-011 @feature ACC-007
describe("the reset link (auth port)", () => {
  it("this client's own server functions are never Django's, even a POST (CODE_REVIEW low)", () => {
    expect(isDjangoPath("/_serverFn/abc123", "POST")).toBe(false);
    expect(isDjangoPath("/_serverFn/abc123", "GET")).toBe(false);
    expect(isDjangoPath("/_serverFnX", "POST")).toBe(true);
  });
  it("the POSTs of the auth page still go to Django", () => {
    expect(isDjangoPath("/register", "POST")).toBe(true);
    expect(isDjangoPath("/password/reset/confirm/MTI/set-password/", "POST")).toBe(true);
  });
  it("recognises the emailed token link, not the set-password address", () => {
    expect(resetLinkUid("/password/reset/confirm/MTI/cxl1-0123456789abcdef/")).toBe("MTI");
    expect(resetLinkUid("/password/reset/confirm/MTI/cxl1-0123456789abcdef")).toBe("MTI");
    expect(resetLinkUid("/password/reset/confirm/MTI/set-password/")).toBeNull();
    expect(resetLinkUid("/login")).toBeNull();
  });
  it("keeps Django's redirect for a good token (it stored the token in the session)", async () => {
    const django = new Response(null, { status: 302, headers: { location: "/password/reset/confirm/MTI/set-password/", "set-cookie": "sessionid=s; Path=/" } });
    const res = await passResetLink(new Request("http://x/password/reset/confirm/MTI/tok/"), "MTI", async () => django);
    expect(res).toBe(django);
  });
  it("turns Django's invalid-link page into a redirect to the set-password address, keeping its cookies", async () => {
    const django = new Response("<html>expired</html>", { status: 200, headers: { "set-cookie": "csrftoken=t; Path=/" } });
    const res = await passResetLink(new Request("http://x/password/reset/confirm/MTI/bad/"), "MTI", async () => django);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(setPasswordPath("MTI"));
    expect(res.headers.get("set-cookie")).toContain("csrftoken=t");
  });
});

// low list (CODE_REVIEW): a Django failure on the reset link is passed on, not hidden behind a redirect to "link expired"
describe("passResetLink when Django fails", () => {
  it("passes a 5xx on as it is", async () => {
    const res = await passResetLink(new Request("http://x/password/reset/confirm/MTI/tok/"), "MTI", async () => new Response("down", { status: 502 }));
    expect(res.status).toBe(502);
  });
});

describe("trailingSlashRedirect", () => {
  const go = (u: string, m = "GET") => trailingSlashRedirect(new URL(u, "https://www.sefaria.org"), m);
  it("a reader or library address loses its slash permanently, keeping the query", () => {
    const r = go("/Genesis.1/?lang=en")!;
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("/Genesis.1?lang=en");
    expect(go("/texts/Tanakh/")!.headers.get("location")).toBe("/texts/Tanakh");
  });
  it("leaves the home page, Django's paths, the auth pages, writes and slash-less addresses alone", () => {
    for (const u of ["/", "/admin/", "/topics/", "/login/", "/password/reset/confirm/MTI/tok/", "/Genesis.1"]) expect(go(u), u).toBeNull();
    expect(go("/Genesis.1/", "POST")).toBeNull();
  });
  it("never redirects to another host (a path that starts with two slashes)", () => {
    for (const u of ["//evil.com/", "/\\evil.com/"]) expect(trailingSlashRedirect(new URL(`https://www.sefaria.org${u}`), "GET"), u).toBeNull();
  });
});

// @feature LEG-010 @feature RTE-019
describe("the version-diff tool (/compare) is this client's on the Library host only", () => {
  it("renders here on the Library host, and stays Django's on the Voices host (Q-E1)", () => {
    expect(isDjangoPath("/compare/Genesis.1/he/a/b", "GET", "www.sefaria.org")).toBe(false);
    expect(isDjangoPath("/compare", "GET", "www.sefaria.org")).toBe(false);
    expect(isDjangoPath("/compare/Genesis.1/he/a/b", "GET", "voices.sefaria.org")).toBe(true);
    expect(isDjangoPath("/compare", "GET", "voices.sefaria.org")).toBe(true);
    // Voices keeps its other pages as they were
    expect(isDjangoPath("/sheets/1", "GET", "voices.sefaria.org")).toBe(true);
    expect(isDjangoPath("/Genesis.1", "GET", "voices.sefaria.org")).toBe(false);
    // a write is always Django's ("Apply Change" posts to /api/texts)
    expect(isDjangoPath("/compare/Genesis.1/", "POST", "www.sefaria.org")).toBe(true);
  });
  it("keeps the trailing slash, which changes what the address means", () => {
    expect(trailingSlashRedirect(new URL("http://x/compare/Genesis.1/"), "GET")).toBeNull();
    expect(trailingSlashRedirect(new URL("http://x/compare/"), "GET")).toBeNull();
  });
  it("the whole request, as src/start.ts decides it: Voices' /compare goes to Django, the Library's stays here", () => {
    const req = (url: string, headers: Record<string, string> = {}, method = "GET") => new Request(url, { method, headers });
    expect(passesToDjango(req("http://reader:3000/compare/Genesis.1/he/a/b", { host: "voices.sefaria.org" }))).toBe(true);
    expect(passesToDjango(req("http://reader:3000/compare", { "x-forwarded-host": "voices.sefaria.org" }))).toBe(true);
    expect(passesToDjango(req("https://voices.sefaria.org/compare/"))).toBe(true);
    expect(passesToDjango(req("http://reader:3000/compare/Genesis.1/he/a/b", { host: "www.sefaria.org" }))).toBe(false);
    expect(passesToDjango(req("https://www.sefaria.org/compare"))).toBe(false);
    expect(passesToDjango(req("https://www.sefaria.org/compare/Genesis.1/", {}, "POST"))).toBe(true);
  });
  it("reads the host nginx passed on", () => {
    expect(requestHost(new Request("http://reader:3000/compare", { headers: { "x-forwarded-host": "voices.sefaria.org" } }))).toBe("voices.sefaria.org");
    expect(requestHost(new Request("http://www.sefaria.org/compare"))).toBe("www.sefaria.org");
  });
});
