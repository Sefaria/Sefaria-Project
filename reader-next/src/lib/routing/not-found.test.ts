import { describe, expect, it } from "vitest";
import { FORCE_NOT_FOUND, asNotFound, isForcedNotFound, isNotFoundMatch, replaceDjangoNotFound } from "./not-found";

const html404 = () => new Response("<h1>Page Not Found</h1>", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-served-by": "django" } });

// @feature RTE-040
describe("the reader's own 404", () => {
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
    expect(isNotFoundMatch({ status: "success", _notFound: true })).toBe(true); // this router version's boundary mark
    expect(isNotFoundMatch({ status: "success" })).toBe(false);
    expect(isNotFoundMatch({ status: "error", error: new Error("x") })).toBe(false);
  });
});

// The mechanism with the real router (TanStack Router, server load): a path Django has 404'd whose catch-all loader would redirect
// (as the reader's "$" route does for a non-canonical ref) must end as the root's not-found, with no page loader run at all.
import { createMemoryHistory, createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { throwIfForcedNotFound, prefsOfForcedNotFound } from "./not-found";

describe("forced not-found in the real router", () => {
  async function load(forced: boolean) {
    const loaderCalls: string[] = [];
    const root = createRootRoute({
      beforeLoad: async (opts) => {
        const prefs = { interfaceLang: "hebrew" };
        await throwIfForcedNotFound(opts, prefs);
        return prefs;
      },
    });
    const splat = createRoute({
      getParentRoute: () => root,
      path: "$",
      loader: async () => {
        loaderCalls.push("$");
        throw redirect({ href: "/Genesis.1.1", statusCode: 301 });
      },
    });
    const router = createRouter({ routeTree: root.addChildren([splat]), history: createMemoryHistory({ initialEntries: ["/people/Gen.1.1"] }), isServer: true });
    router.options.additionalContext = { serverContext: forced ? { [FORCE_NOT_FOUND]: true } : {} };
    await router.load();
    const r = router as unknown as { _serverResult?: { type: string }; state: { matches: { routeId: string; status: string; error?: unknown }[] } };
    return { loaderCalls, serverResult: r._serverResult?.type, matches: r.state.matches };
  }

  it("without the flag the catch-all's redirect wins (what happened before)", async () => {
    const out = await load(false);
    expect(out.loaderCalls).toEqual(["$"]);
    expect(out.serverResult).toBe("redirect");
  });
  it("with the flag: no loader runs, no redirect, the root is not-found and carries the reader's preferences", async () => {
    const out = await load(true);
    expect(out.loaderCalls).toEqual([]);
    expect(out.serverResult).not.toBe("redirect");
    const root = out.matches[0]!;
    expect(isNotFoundMatch(root as never)).toBe(true);
    expect(prefsOfForcedNotFound(root.error)).toEqual({ interfaceLang: "hebrew" });
  });
});
