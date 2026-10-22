import { describe, expect, it } from "vitest";
import { isDjangoPath, passResetLink, resetLinkUid, setPasswordPath } from "./pass-through";

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
