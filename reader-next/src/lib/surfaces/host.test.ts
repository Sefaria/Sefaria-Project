import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import type { ReaderStateApi } from "~/lib/reader-state/core/types";
import type { WorkspaceCommands } from "~/lib/workspace/commands";
import { socialEnvFrom } from "~/lib/config";
import { createSurfaceHost, SURFACE_STATE_KEY, type SurfaceHostDeps, type SurfaceRouter, type UiState } from "./host";

function makeRouter(initial = "/social") {
  const root = createRootRoute();
  const splat = createRoute({ getParentRoute: () => root, path: "$" });
  return createRouter({ routeTree: root.addChildren([splat]), history: createMemoryHistory({ initialEntries: [initial] }) });
}

function hostWith(over: Partial<SurfaceHostDeps> = {}, initial?: string) {
  const router = makeRouter(initial);
  let ui: UiState = { interfaceLang: "english", theme: "light" };
  const uiSubs = new Set<() => void>();
  const deps: SurfaceHostDeps = {
    router: router as unknown as SurfaceRouter,
    state: { getSnapshot: vi.fn() } as unknown as ReaderStateApi,
    commands: { current: vi.fn() } as unknown as WorkspaceCommands,
    viewer: { get: () => ({ id: 7, name: "Reader One", imageUrl: "https://example.org/a.png", profileUrl: "/profile/x" }) as never, subscribe: () => () => {} },
    identityToken: async () => "tok",
    requestSignIn: vi.fn(),
    ui: { get: () => ui, subscribe: (cb) => (uiSubs.add(cb), () => void uiSubs.delete(cb)) },
    config: socialEnvFrom({ PUBLIC_SOCIAL_MANIFEST_URL: "https://s.example.org/m.json", PUBLIC_SOCIAL_API_ORIGIN: "https://api.s.example.org/", PUBLIC_SOCIAL_RELAY_ORIGIN: "wss://relay.s.example.org/x", PUBLIC_SOCIAL_ENVIRONMENT: "staging" }),
    version: "r9",
    leavesClient: (p) => p.startsWith("/sheets"),
    siteOrigin: "",
    load: vi.fn(),
    reportError: vi.fn(),
    event: vi.fn(),
    ...over,
  };
  const setUi = (next: UiState) => {
    ui = next;
    uiSubs.forEach((cb) => cb());
  };
  return { host: createSurfaceHost(deps), router, deps, setUi };
}

// @feature SHL-078
describe("the SurfaceHost", () => {
  it("is contract 1.0 and hands over the reader's own state API and commands", () => {
    const { host, deps } = hostWith();
    expect(host.contract).toEqual({ major: 1, minor: 0 });
    expect(host.reader.state).toBe(deps.state);
    expect(host.reader.commands).toBe(deps.commands);
    expect(host.config).toEqual({ apiOrigin: "https://api.s.example.org", relayOrigin: "wss://relay.s.example.org", environment: "staging" });
  });

  it("navigates through the router, keeping the surface's state apart from the reader's", async () => {
    const { host, router } = hostWith();
    await router.load();
    const seen = vi.fn();
    host.location.subscribe(seen);
    host.navigate("/social/r/abcdefgh?tab=chat", { state: { step: 2 } });
    await vi.waitFor(() => expect(host.location.get().pathname).toBe("/social/r/abcdefgh"));
    expect(host.location.get()).toMatchObject({ search: "?tab=chat", state: { step: 2 } });
    expect((router.history.location.state as unknown as Record<string, unknown>)[SURFACE_STATE_KEY]).toEqual({ step: 2 });
    expect(seen).toHaveBeenCalled();
    const length = router.history.length;
    host.navigate("/Genesis.1?lang=bi", { replace: true });
    await vi.waitFor(() => expect(host.location.get().pathname).toBe("/Genesis.1"));
    expect(router.history.length).toBe(length);
  });

  it("loads Django's pages in full and refuses anything off the site", () => {
    const { host, deps } = hostWith();
    host.navigate("/sheets/123");
    expect(deps.load).toHaveBeenCalledWith("/sheets/123", false);
    for (const bad of ["https://evil.example/", "//evil.example", "javascript:alert(1)", "/\\evil.example"]) host.navigate(bad);
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(deps.reportError).toHaveBeenCalledTimes(4);
    expect(host.href("/Genesis.1")).toBe("/Genesis.1");
    expect(host.href("/sheets/1")).toBe("/sheets/1");
    expect(host.href("https://evil.example/")).toBe("#");
  });

  it("reads the reserved ctx and tells only when it changes", async () => {
    const { host, router } = hostWith({}, "/Genesis.1?lang=bi&ctx=social.room.abcdefgh");
    await router.load();
    expect(host.reader.context.get()).toBe("social.room.abcdefgh");
    const cb = vi.fn();
    host.reader.context.subscribe(cb);
    host.navigate("/Genesis.2?lang=bi&ctx=social.room.abcdefgh");
    await vi.waitFor(() => expect(host.location.get().pathname).toBe("/Genesis.2"));
    expect(cb).not.toHaveBeenCalled();
    host.navigate("/Genesis.2?lang=bi");
    await vi.waitFor(() => expect(host.reader.context.get()).toBeNull());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("gives the viewer as the contract says, and the ui at access time", () => {
    const { host, setUi } = hostWith();
    expect(host.viewer.get()).toEqual({ id: 7, name: "Reader One", imageUrl: "https://example.org/a.png" });
    const cb = vi.fn();
    host.ui.subscribe(cb);
    setUi({ interfaceLang: "hebrew", theme: "light" });
    expect(host.ui.interfaceLang).toBe("hebrew");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("reports errors to error reporting and events to analytics, tagged with the release", () => {
    const { host, deps } = hostWith();
    host.report({ kind: "error", name: "relay", data: { message: "closed", nested: { x: 1 } } });
    expect(deps.reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "[surface social@r9] relay: closed" }), "surface:social@r9");
    host.report({ kind: "event", name: "joined", data: { room: "abc", n: 2, nested: { x: 1 } } });
    expect(deps.event).toHaveBeenCalledWith("social_joined", { room: "abc", n: 2, surface_version: "r9" });
  });
});

// @feature SHL-077
describe("socialEnvFrom", () => {
  it("is off without a manifest or a dev entry", () => {
    expect(socialEnvFrom({})).toBeUndefined();
    expect(socialEnvFrom({ PUBLIC_SOCIAL_MANIFEST_URL: "not a url" })).toBeUndefined();
  });
  it("reads the allowlist as origins, failing closed", () => {
    expect(socialEnvFrom({ PUBLIC_SOCIAL_MANIFEST_URL: "https://s.example.org/m.json" })!.allowedOrigins).toEqual([]);
    expect(socialEnvFrom({ PUBLIC_SOCIAL_MANIFEST_URL: "https://s.example.org/m.json", PUBLIC_SOCIAL_ORIGINS: "https://s.example.org/, junk, http://localhost:3200" })!.allowedOrigins).toEqual(["https://s.example.org", "http://localhost:3200"]);
  });
  it("takes a dev entry only outside production, and only on localhost", () => {
    expect(socialEnvFrom({ PUBLIC_SOCIAL_DEV_ENTRY: "http://localhost:3200/src/surface/entry.ts" })!.devEntry).toBe("http://localhost:3200/src/surface/entry.ts");
    expect(socialEnvFrom({ PUBLIC_SOCIAL_DEV_ENTRY: "http://localhost:3200/e.ts", NODE_ENV: "production" })).toBeUndefined();
    expect(socialEnvFrom({ PUBLIC_SOCIAL_DEV_ENTRY: "https://evil.example/e.ts" })).toBeUndefined();
  });
});
