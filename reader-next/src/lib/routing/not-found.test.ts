import { describe, expect, it } from "vitest";
import { FORCE_NOT_FOUND, asNotFound, isForcedNotFound, isNotFoundMatch, replaceDjangoNotFound } from "./not-found";

const html404 = () => new Response("<h1>Page Not Found</h1>", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-served-by": "django" } });

// @feature RTE-040
describe("the reader's own 404 (T-F28)", () => {
  it("replaces Django's page 404, never an API's, a non-read's, another status or the Voices host's", () => {
    expect(replaceDjangoNotFound("/nonexistent", "GET", html404(), false)).toBe(true);
    expect(replaceDjangoNotFound("/person/Nobody", "HEAD", html404(), false)).toBe(true);
    expect(replaceDjangoNotFound("/api/texts/x", "GET", html404(), false)).toBe(false);
    expect(replaceDjangoNotFound("/static/x.js", "GET", html404(), false)).toBe(false);
    expect(replaceDjangoNotFound("/x", "POST", html404(), false)).toBe(false);
    expect(replaceDjangoNotFound("/x", "GET", html404(), true)).toBe(false);
    expect(replaceDjangoNotFound("/x", "GET", new Response("{}", { status: 404, headers: { "content-type": "application/json" } }), false)).toBe(false);
    expect(replaceDjangoNotFound("/x", "GET", new Response("", { status: 200, headers: { "content-type": "text/html" } }), false)).toBe(false);
    expect(replaceDjangoNotFound("/x", "GET", new Response(null, { status: 302, headers: { location: "/y" } }), false)).toBe(false);
  });
  it("the root route sees the server's request for it", () => {
    expect(isForcedNotFound({ serverContext: { [FORCE_NOT_FOUND]: true } })).toBe(true);
    expect(isForcedNotFound({ serverContext: {} })).toBe(false);
    expect(isForcedNotFound({})).toBe(false);
    expect(isForcedNotFound(undefined)).toBe(false);
  });
  it("answers 404, noindex, revalidated", async () => {
    const r = asNotFound(new Response("<p>x</p>", { status: 200, headers: { "content-type": "text/html", "content-length": "8" } }));
    expect(r.status).toBe(404);
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.headers.get("content-length")).toBeNull();
    expect(await r.text()).toBe("<p>x</p>");
  });
  it("knows a not-found match however the router marked it", () => {
    expect(isNotFoundMatch({ status: "notFound" })).toBe(true);
    expect(isNotFoundMatch({ status: "success", error: { isNotFound: true } })).toBe(true);
    expect(isNotFoundMatch({ status: "success", globalNotFound: true })).toBe(true);
    expect(isNotFoundMatch({ status: "success" })).toBe(false);
    expect(isNotFoundMatch({ status: "error", error: new Error("x") })).toBe(false);
  });
});
