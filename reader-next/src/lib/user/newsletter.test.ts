import { afterEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIBE_FAILED, isValidEmailAddress, subscribeNewsletter, subscribeUrl } from "./newsletter";

afterEach(() => vi.unstubAllGlobals());

// @feature PRM-016 @feature LIB-050
describe("newsletter sign-up", () => {
  it("checks addresses as the old client did", () => {
    expect(isValidEmailAddress("reader@example.com")).toBe(true);
    expect(isValidEmailAddress("not-an-email")).toBe(false);
    expect(isValidEmailAddress("a@b")).toBe(false);
  });
  it("posts {language, educator, firstName, lastName} to /api/subscribe/<email> (the address unencoded, as the old client)", async () => {
    document.cookie = "csrftoken=tok";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await subscribeNewsletter({ firstName: "Ada", lastName: "L", email: "a+b@example.com", educator: false, interfaceLang: "hebrew" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/subscribe\/a\+b@example\.com$/);
    expect(subscribeUrl("a@b.co")).toBe("/api/subscribe/a@b.co");
    expect(JSON.parse(init.body as string)).toEqual({ language: "he", educator: false, firstName: "Ada", lastName: "L" });
    expect((init.headers as Record<string, string>)["X-CSRFToken"]).toBe("tok");
  });
  it("rejects with Django's error, or the old generic message for a failed status", async () => {
    document.cookie = "csrftoken=tok";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Blocked." }), { status: 200 })));
    await expect(subscribeNewsletter({ firstName: "A", lastName: "B", email: "a@b.co", educator: true, interfaceLang: "english" })).rejects.toThrow("Blocked.");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(subscribeNewsletter({ firstName: "A", lastName: "B", email: "a@b.co", educator: true, interfaceLang: "english" })).rejects.toThrow(SUBSCRIBE_FAILED);
  });
});
