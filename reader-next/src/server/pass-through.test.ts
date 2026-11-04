import { describe, expect, it } from "vitest";
import { isDjangoPath, isDjangoRequest, passesToDjango, passResetLink, requestHost, resetLinkUid, setPasswordPath, trailingSlashRedirect } from "./pass-through";

describe("isDjangoPath (PLT deployment: which requests go to Django)", () => {
  it("sends Django's own sections through", () => {
    for (const p of ["/api/texts/Genesis.1", "/logout", "/accounts/apple/login/", "/_allauth/browser/v1/auth/session", "/sheets/123", "/static/js/x.js", "/profile/me", "/admin/", "/sefaria.js"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(true);
    }
  });
  it("keeps reader and library pages here", () => {
    for (const p of ["/", "/login", "/login/", "/register", "/password/reset/confirm/MTI/set-password/", "/texts", "/texts/Tanakh", "/Genesis.1", "/Genesis.1.1-5", "/search", "/Rashi_on_Genesis.1.1", "/topicsfoo", "/apis", "/topics", "/topics/category/authors", "/topics/all/a", "/topics/all/%D7%90", "/topics/light", "/topics/b/light", "/topics/parashat-noach"]) {
      expect(isDjangoPath(p, "GET"), p).toBe(false);
    }
  });
  // @feature RTE-011 @feature RTE-065
  it("/translations/<lang> is rendered here on the Library host; on the Voices host it stays Django's (Q-E1)", () => {
    for (const host of [undefined, "www.sefaria.org", "localhost:3100", "www.sefaria.org.il"]) {
      expect(isDjangoPath("/translations/de", "GET", host)).toBe(false);
    }
    for (const host of ["voices.sefaria.org", "voices.cauldron.sefaria.org", "VOICES.sefaria.org"]) {
      expect(isDjangoPath("/translations/de", "GET", host)).toBe(true);
      expect(isDjangoPath("/texts", "GET", host)).toBe(false);
    }
    expect(isDjangoPath("/translationsfoo", "GET", "voices.sefaria.org")).toBe(false);
    expect(isDjangoPath("/translate/x", "GET")).toBe(true);
  });
  // @feature RTE-065
  it("the Hebrew Voices host (chiburim) keeps /translations on Django too; the Hebrew Library host does not", () => {
    for (const host of ["chiburim.sefaria.org.il", "chiburim.sef-stage-il.org", "CHIBURIM.sefaria.org.il:443"]) {
      expect(isDjangoPath("/translations/de", "GET", host), host).toBe(true);
      expect(isDjangoPath("/translations/he", "GET", host), host).toBe(true);
      expect(isDjangoPath("/Genesis.1", "GET", host), host).toBe(false);
    }
    for (const host of ["www.sefaria.org.il", "sefaria.org.il", "notchiburim.sefaria.org.il", "voicesx.sefaria.org"]) {
      expect(isDjangoPath("/translations/de", "GET", host), host).toBe(false);
    }
  });
  // @feature RTE-011
  it("a translations address with a trailing slash is Django's (its 404), on every host — as sefaria.org answers", () => {
    for (const p of ["/translations/", "/translations/de/", "/translations/de/x/"]) expect(isDjangoPath(p, "GET", "www.sefaria.org"), p).toBe(true);
    expect(trailingSlashRedirect(new URL("http://localhost/translations/de/"), "GET")).toBeNull();
  });
  // @feature RTE-065
  it("a whole request: the host nginx forwarded (X-Forwarded-Host) decides, not the address the server was reached at", () => {
    const req = (host?: string) => new Request("http://reader:3000/translations/de", host ? { headers: { "x-forwarded-host": host } } : undefined);
    expect(isDjangoRequest(req())).toBe(false);
    expect(isDjangoRequest(req("www.sefaria.org"))).toBe(false);
    expect(isDjangoRequest(req("voices.sefaria.org"))).toBe(true);
    expect(isDjangoRequest(req("chiburim.sefaria.org.il"))).toBe(true);
    expect(isDjangoRequest(req("chiburim.sefaria.org.il, proxy.internal"))).toBe(true);
    expect(isDjangoRequest(new Request("http://voices.localhost:3000/translations/de"))).toBe(true);
    expect(isDjangoRequest(new Request("http://reader:3000/texts", { headers: { "x-forwarded-host": "voices.sefaria.org" } }))).toBe(false);
    expect(isDjangoRequest(new Request("http://reader:3000/translations/de", { method: "POST" }))).toBe(true);
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
    for (const u of ["/", "/admin/", "/sheets/123/", "/login/", "/password/reset/confirm/MTI/tok/", "/Genesis.1"]) expect(go(u), u).toBeNull();
    expect(go("/Genesis.1/", "POST")).toBeNull();
  });
  it("never redirects to another host (a path that starts with two slashes)", () => {
    for (const u of ["//evil.com/", "/\\evil.com/"]) expect(trailingSlashRedirect(new URL(`https://www.sefaria.org${u}`), "GET"), u).toBeNull();
  });
});

// @feature CAL-001 @feature CAL-003
describe("trailing slashes of the calendars pages (sefaria.org: /calendars/ is a page, /parashat-hashavua/ a 404)", () => {
  it("never redirects them", () => {
    for (const p of ["/calendars/", "/parashat-hashavua/", "/todays-daf-yomi/"]) expect(trailingSlashRedirect(new URL(`http://x${p}`), "GET"), p).toBeNull();
  });
  it("renders them here on the Library host (no longer Django's paths)", () => {
    for (const p of ["/calendars", "/calendars/", "/parashat-hashavua", "/todays-daf-yomi"]) expect(isDjangoPath(p, "GET"), p).toBe(false);
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

// @feature TOP-001 @feature TOP-002
describe("the topics port: which /topics pages are this client's", () => {
  it("every Library /topics page is this client's: a single topic (and its /b/ test version), the landing page, categories and A–Z", () => {
    expect(isDjangoPath("/topics/rashi", "GET")).toBe(false);
    expect(isDjangoPath("/topics/b/rashi", "GET")).toBe(false);
    expect(isDjangoPath("/topics/judges-(%D7%A9%D7%95%D7%A4%D7%98)", "GET")).toBe(false);
    expect(isDjangoPath("/topics", "GET")).toBe(false);
    expect(isDjangoPath("/topics/category/torah-portions", "GET")).toBe(false);
    expect(isDjangoPath("/topics/all/b", "GET")).toBe(false);
  });
  it("the legacy redirects that land on the topics pages stay Django's (/people, /people/Talmud, /person/<name>, /sheets/tags)", () => {
    for (const p of ["/people", "/people/Talmud", "/person/Rashi", "/sheets/tags", "/sheets/tags/Shabbat"]) expect(isDjangoPath(p, "GET"), p).toBe(true);
  });
  it("on the Voices host every /topics page is Django's (Q-E1: the host model is undecided)", () => {
    const voices = (path: string, host = "voices.sefaria.org") => new Request(`http://${host}${path}`);
    for (const p of ["/topics", "/topics/category/authors", "/topics/all/a", "/topics/moses", "/topics/b/moses"]) {
      expect(isDjangoRequest(voices(p), p), p).toBe(true);
      expect(isDjangoRequest(voices(p, "chiburim.sefaria.org.il"), p), p).toBe(true);
      expect(isDjangoRequest(new Request(`http://www.sefaria.org${p}`), p), p).toBe(false);
    }
    // behind a proxy the visitor's host is the forwarded one
    const proxied = new Request("http://reader:3000/topics", { headers: { "x-forwarded-host": "voices.cauldron.sefaria.org" } });
    expect(isDjangoRequest(proxied, "/topics")).toBe(true);
    expect(isDjangoRequest(voices("/texts"), "/texts")).toBe(false);
  });
});
