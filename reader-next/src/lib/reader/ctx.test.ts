import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ctxOf, CTX_RE, parseCtx, withCtx, withoutCtx } from "./ctx";
import { validateReaderSearch } from "./url-state";
import { decodeWorkspace, encodeWorkspace, workspaceUrl } from "~/lib/workspace/url";
import { createWorkspaceCommands, type WorkspaceRouter } from "~/lib/workspace/commands";
import { close, openNextTo, openOnly, updatePanel } from "~/lib/workspace/ops";
import { pageUrls } from "~/lib/library/page-head";
import { createSefariaHost } from "~/lib/reader-state/sefaria/host";
import { createReaderStateApi } from "~/lib/reader-state/core/api";
import type { SliceRegistry } from "~/lib/reader-state/core/types";

const ROOM = "social.room.abc_123-XY";

// @feature RTE-066
describe("the reserved ctx parameter: its grammar", () => {
  it("accepts a namespace, a dot and an opaque rest", () => {
    for (const ok of ["social.room.abc12345", "social.shiur.A_b-c.d", "x1.y", `a.${"z".repeat(160)}`]) expect(parseCtx(ok), ok).toBe(ok);
  });
  it("refuses anything else", () => {
    for (const bad of ["", "social", "Social.room", "1social.room", "social.", ".room", "social.room id", "social.room/x", "social.<b>", `a.${"z".repeat(161)}`, 42, null, undefined])
      expect(parseCtx(bad), String(bad)).toBeUndefined();
    expect(CTX_RE.source).toBe("^[a-z][a-z0-9]*\\.[A-Za-z0-9_.-]{1,160}$");
  });
  it("reads, removes and sets it in an address without touching other bytes", () => {
    expect(ctxOf(`/Genesis.1?lang=bi&ctx=${ROOM}`)).toBe(ROOM);
    expect(ctxOf("?ctx=bad value")).toBeNull();
    expect(withoutCtx(`/Genesis.1?ven=german|Die+f%C3%BCnf&ctx=${ROOM}&lang=bi#x`)).toBe("/Genesis.1?ven=german|Die+f%C3%BCnf&lang=bi#x");
    expect(withoutCtx(`/Genesis.1?ctx=${ROOM}`)).toBe("/Genesis.1");
    expect(withoutCtx("/Genesis.1?lang=bi")).toBe("/Genesis.1?lang=bi");
    expect(withCtx("/Genesis.1?ctx=social.old&lang=bi", ROOM)).toBe(`/Genesis.1?lang=bi&ctx=${ROOM}`);
    expect(withCtx("/Genesis.1?lang=bi", "not valid")).toBe("/Genesis.1?lang=bi");
  });
});

// @feature RTE-066
describe("the reserved ctx parameter survives the reader's own rewrites", () => {
  it("validateReaderSearch keeps a well-formed ctx and drops a malformed one", () => {
    expect(validateReaderSearch({ lang: "bi", ctx: ROOM, junk: "x" })).toEqual({ lang: "bi", ctx: ROOM });
    expect(validateReaderSearch({ lang: "bi", ctx: "javascript:alert(1)" })).toEqual({ lang: "bi" });
  });

  it("the workspace codec reads it and writes it back last; without it every legacy address is unchanged", () => {
    const ws = decodeWorkspace("Genesis 1", { lang: "en", p2: "Exodus.1", ctx: ROOM });
    expect(ws.ctx).toBe(ROOM);
    const enc = encodeWorkspace(ws)!;
    expect(Object.keys(enc.search).at(-1)).toBe("ctx");
    expect(enc.search.ctx).toBe(ROOM);
    expect(workspaceUrl(decodeWorkspace("Genesis 1", { lang: "en" }))).toBe("/Genesis.1?lang=en&aliyot=0");
  });

  it("workspace operations carry it (scroll update, opening and closing a panel, opening alone)", () => {
    const ws = decodeWorkspace("Genesis 1", { lang: "bi", ctx: ROOM });
    expect(updatePanel(ws, "p1", { ref: "Genesis 1:5" }).ctx).toBe(ROOM);
    const two = openNextTo(ws, "p1", { kind: "text", ref: "Exodus 1", versions: {} });
    expect(two.ctx).toBe(ROOM);
    expect(close(two, "p1").ctx).toBe(ROOM);
    expect(openOnly(ws, { kind: "text", ref: "Leviticus 1", versions: {} }).ctx).toBe(ROOM);
  });

  const fakeRouter = (pathname: string, search: Record<string, string>, state: unknown = {}) => {
    const navigate = vi.fn(async (_opts: Record<string, unknown>) => undefined);
    const router: WorkspaceRouter = { state: { location: { pathname, search, state }, matches: [{ routeId: "__root__" }, { routeId: "/$" }] }, navigate };
    return { router, navigate };
  };
  const defaults = () => ({ lang: "bi" as const, aliyot: 0 as const });

  it("canonicalize() keeps it while completing the address", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", { ctx: ROOM });
    expect(await createWorkspaceCommands(router, defaults).canonicalize()).toBe(true);
    expect((navigate.mock.calls[0]![0] as { search: Record<string, string> }).search).toEqual({ lang: "bi", aliyot: "0", ctx: ROOM });
  });

  it("canonicalize() does nothing more when the full address already carries it", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", { lang: "bi", aliyot: "0", ctx: ROOM });
    expect(await createWorkspaceCommands(router, defaults).canonicalize()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a scroll's replace and a panel's go keep it", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", { lang: "bi", aliyot: "0", ctx: ROOM });
    const cmd = createWorkspaceCommands(router, defaults);
    await cmd.go(updatePanel(cmd.current(), "p1", { ref: "Genesis 1:7" }), { replace: true, state: { nav: "scroll", panel: "p1" } });
    await cmd.go(openNextTo(cmd.current(), "p1", { kind: "text", ref: "Exodus 2", versions: {} }), { state: { nav: "go" } });
    for (const [opts] of navigate.mock.calls) expect((opts as { search: Record<string, string> }).search.ctx).toBe(ROOM);
  });
});

// @feature RTE-066 @feature PLT-008
describe("the reserved ctx parameter is left out of what names the page", () => {
  it("canonical and og:url", () => {
    const u = pageUrls(`/Genesis?tab=versions&ctx=${ROOM}`, "https://www.sefaria.org", { english: "https://www.sefaria.org", hebrew: "https://www.sefaria.org.il" });
    expect(JSON.stringify(u)).not.toContain("ctx");
    expect(u.links.find((l) => l.rel === "canonical")!.href).toBe("https://www.sefaria.org/Genesis?tab=versions");
  });

  const registry: SliceRegistry = { register: () => () => {}, get: () => undefined, list: () => [], onChange: () => () => {} };
  function makeRouter(initial: string) {
    const root = createRootRoute();
    const splat = createRoute({ getParentRoute: () => root, path: "$" });
    return createRouter({ routeTree: root.addChildren([splat]), history: createMemoryHistory({ initialEntries: [initial] }) });
  }

  it("the state API's snapshot url; applying a snapshot keeps the context the reader is in", async () => {
    const router = makeRouter(`/Genesis.1?lang=bi&ctx=${ROOM}`);
    await router.load();
    const api = createReaderStateApi(createSefariaHost(router, registry));
    expect(api.getSnapshot().url).toBe("/Genesis.1?lang=bi");
    await api.applySnapshot({ v: 1, url: "/Exodus.2?lang=en", nav: {}, slices: {} }, { origin: "follow", persist: false });
    expect(`${router.history.location.pathname}${router.history.location.search}`).toBe(`/Exodus.2?lang=en&ctx=${ROOM}`);
    expect(api.getSnapshot().url).toBe("/Exodus.2?lang=en");
  });

  it("a snapshot's own ctx is never applied", async () => {
    const router = makeRouter("/Genesis.1?lang=bi");
    await router.load();
    const api = createReaderStateApi(createSefariaHost(router, registry));
    await api.applySnapshot({ v: 1, url: `/Exodus.2?lang=en&ctx=${ROOM}`, nav: {}, slices: {} }, { origin: "follow", persist: false });
    expect(router.history.location.search).toBe("?lang=en");
  });
});
