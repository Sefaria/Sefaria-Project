import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { SliceRegistry } from "~/lib/reader-state/core/types";
import { createSefariaHost, replayableNav } from "./host";

const registry: SliceRegistry = { register: () => () => {}, get: () => undefined, list: () => [], onChange: () => () => {} };

function makeRouter(initial = "/Genesis.1?lang=bi", state?: Record<string, unknown>) {
  const root = createRootRoute();
  const splat = createRoute({ getParentRoute: () => root, path: "$" });
  const history = createMemoryHistory({ initialEntries: [initial] });
  if (state) history.replace(initial, state as never);
  return createRouter({ routeTree: root.addChildren([splat]), history });
}

afterEach(() => vi.restoreAllMocks());

describe("createSefariaHost", () => {
  it("reads the location as the address bar writes it, and only the replayable nav", async () => {
    const router = makeRouter("/Genesis.1?lang=bi", { nav: "go", panel: "p1", ref: "Genesis 1:3", terms: ["light"], panelKeys: ["a", "b"], canonical: true, key: "zz", junk: 1 });
    await router.load();
    const host = createSefariaHost(router, registry);
    const { url, nav } = host.getLocation();
    expect(url).toBe("/Genesis.1?lang=bi");
    expect(nav).toEqual({ nav: "go", panel: "p1", ref: "Genesis 1:3", terms: ["light"], panelKeys: ["a", "b"] });
    expect(JSON.stringify(nav)).not.toContain("__TSR");
  });

  it("navigates with push and replace, carrying the nav state", async () => {
    const router = makeRouter();
    await router.load();
    const host = createSefariaHost(router, registry);
    const start = router.history.length;

    await host.navigate("/Exodus.2?lang=en", { panelKeys: ["k1"], __TSR_key: "x" }, "push");
    expect(host.getLocation()).toEqual({ url: "/Exodus.2?lang=en", nav: { panelKeys: ["k1"] } });
    expect(router.history.length).toBe(start + 1);

    await host.navigate("/Leviticus.3", { nav: "stay" }, "replace");
    expect(host.getLocation().url).toBe("/Leviticus.3");
    expect(host.getLocation().nav).toEqual({ nav: "stay" });
    expect(router.history.length).toBe(start + 1);
  });

  it("refuses a url it does not accept, without navigating", async () => {
    const router = makeRouter();
    await router.load();
    const host = createSefariaHost(router, registry);
    await expect(host.navigate("//evil.com", {}, "push")).rejects.toThrow(/refused/);
    expect(host.getLocation().url).toBe("/Genesis.1?lang=bi");
    expect(host.acceptsUrl("/api/texts")).toBe(false);
    expect(host.acceptsUrl("/Genesis.2")).toBe(true);
  });

  it("fires onLocationChange after each committed navigation, and stops when unsubscribed", async () => {
    const router = makeRouter();
    await router.load();
    const host = createSefariaHost(router, registry);
    const cb = vi.fn();
    const off = host.onLocationChange(cb);
    await host.navigate("/Exodus.1", {}, "push");
    expect(cb).toHaveBeenCalledTimes(1);
    // back/forward: without a mounted RouterProvider nothing loads on a history change, so do what its Transitioner does
    router.history.back();
    await router.load();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(host.getLocation().url).toBe("/Genesis.1?lang=bi");
    off();
    await host.navigate("/Exodus.3", {}, "push");
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("settles once the router is idle", async () => {
    const router = makeRouter();
    const host = createSefariaHost(router, registry);
    const nav = router.load();
    await host.settled();
    await nav;
    expect(router.state.status).toBe("idle");
  });

  it("reports the person's input and back/forward", () => {
    const host = createSefariaHost(makeRouter(), registry);
    const cb = vi.fn();
    const off = host.onLocalInput(cb);
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("wheel"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
    window.dispatchEvent(new Event("touchstart"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(cb.mock.calls.map((c) => c[0])).toEqual(["input", "input", "input", "input", "history"]);
    off();
    window.dispatchEvent(new Event("pointerdown"));
    expect(cb).toHaveBeenCalledTimes(5);
  });

  it("hears input even when a component stops its propagation (capture phase)", () => {
    const host = createSefariaHost(makeRouter(), registry);
    const cb = vi.fn();
    const off = host.onLocalInput(cb);
    const el = document.createElement("button");
    document.body.appendChild(el);
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(cb).toHaveBeenCalledWith("input");
    off();
    el.remove();
  });

  it("schedules work", async () => {
    const host = createSefariaHost(makeRouter(), registry);
    const cb = vi.fn();
    host.schedule!(cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
  });

  it("exposes the registry it was given", () => {
    expect(createSefariaHost(makeRouter(), registry).slices).toBe(registry);
  });
});

describe("replayableNav", () => {
  it("drops mistyped and unknown fields from a foreign snapshot", () => {
    expect(replayableNav({ nav: "explode", panel: 3, ref: ["x"], terms: [1], panelKeys: "a", __proto__: { evil: 1 } })).toEqual({});
    expect(replayableNav(null)).toEqual({});
    expect(replayableNav("go")).toEqual({});
  });
});
