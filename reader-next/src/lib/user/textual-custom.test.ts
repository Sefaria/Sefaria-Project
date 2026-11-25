import { describe, expect, it, vi } from "vitest";
import { customFromProfile, fetchTextualCustom, profileSlug } from "./textual-custom";

// @feature CAL-004
describe("the reader's textual custom (the Learning Schedules page's haftarah)", () => {
  it("takes the slug from the viewer's profile link", () => {
    expect(profileSlug("/profile/ada-lovelace")).toBe("ada-lovelace");
    expect(profileSlug("/profile/ada/")).toBe("ada");
    expect(profileSlug(undefined)).toBeNull();
    expect(profileSlug("https://evil.example/profile/x")).toBeNull();
  });
  it("reads settings.textual_custom; a profile without it (or another's, without settings) is ashkenazi", () => {
    expect(customFromProfile({ settings: { textual_custom: "sephardi" } })).toBe("sephardi");
    expect(customFromProfile({ settings: {} })).toBe("ashkenazi");
    expect(customFromProfile({ slug: "x" })).toBe("ashkenazi");
    expect(customFromProfile(null)).toBe("ashkenazi");
  });
  it("asks /api/profile/<slug> with the reader's cookie on the server; a failure is ashkenazi; no slug asks nothing", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ settings: { textual_custom: "sephardi" } }), { status: 200 }));
    expect(await fetchTextualCustom("http://api", "ada", "sessionid=1", f as unknown as typeof fetch)).toBe("sephardi");
    expect(f).toHaveBeenCalledWith("http://api/api/profile/ada", { headers: { cookie: "sessionid=1", accept: "application/json" } });
    const bad = vi.fn(async () => new Response("<html>", { status: 404 }));
    expect(await fetchTextualCustom("http://api", "ada", "sessionid=1", bad as unknown as typeof fetch)).toBe("ashkenazi");
    const none = vi.fn();
    expect(await fetchTextualCustom("http://api", null, "", none as unknown as typeof fetch)).toBe("ashkenazi");
    expect(none).not.toHaveBeenCalled();
  });
});
