import { describe, expect, it, vi } from "vitest";
import { createWorkspaceCommands, withPanelKeys, type WorkspaceRouter } from "./commands";
import { close } from "./ops";
import { decodeWorkspace } from "./url";

const fakeRouter = (pathname: string, search: Record<string, string>, state: unknown = {}, routeId = "/$") => {
  const navigate = vi.fn(async (_opts: Record<string, unknown>) => undefined);
  const router: WorkspaceRouter = { state: { location: { pathname, search, state }, matches: [{ routeId: "__root__" }, { routeId }] }, navigate };
  return { router, navigate };
};
const defaults = () => ({ lang: "bi" as const, aliyot: 0 as const });

// @feature SHL-066 @feature RTE-043
describe("workspace commands (outside React: CODE_REVIEW §3.3)", () => {
  it("current() reads the workspace from the router's location", () => {
    const { router } = fakeRouter("/Genesis.1", { lang: "en", p2: "Exodus.1" });
    const ws = createWorkspaceCommands(router, defaults).current();
    expect(Object.keys(ws.panels)).toEqual(["p1", "p2"]);
  });

  it("go() navigates through the router with the values themselves (no string re-parsing)", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", { lang: "bi" });
    const ws = decodeWorkspace("Genesis 1:1", { lang: "bi", with: "SidebarSearch", sbsq: "100% & p2=x" });
    await createWorkspaceCommands(router, defaults).go(ws, { state: { nav: "stay" } });
    const opts = navigate.mock.calls[0]![0] as { search: Record<string, string>; state: unknown; to: string };
    expect(opts.to).toBe("/$");
    expect(opts.search.sbsq).toBe("100% & p2=x");
    expect(opts.search.p2).toBeUndefined();
    expect(opts.state).toMatchObject({ nav: "stay", panelKeys: [expect.stringMatching(/^k/)] }); // a panel with no key yet gets a fresh one
  });

  it("canonicalize() completes a short address by a replace that keeps the entry's own state", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", {}, { nav: "go", panel: "p1", __TSR_key: "k1", __TSR_index: 3 });
    expect(await createWorkspaceCommands(router, defaults).canonicalize()).toBe(true);
    const opts = navigate.mock.calls[0]![0] as { replace: boolean; search: Record<string, string>; state: Record<string, unknown> };
    expect(opts.replace).toBe(true);
    expect(opts.search).toEqual({ lang: "bi", aliyot: "0" });
    expect(opts.state).toEqual({ nav: "go", panel: "p1", canonical: true }); // the router's own key is not copied; marked as completion
  });

  it("canonicalize() does nothing when the address is already full, or off the reader route", async () => {
    const full = fakeRouter("/Genesis.1", { lang: "bi", aliyot: "0" });
    expect(await createWorkspaceCommands(full.router, defaults).canonicalize()).toBe(false);
    expect(full.navigate).not.toHaveBeenCalled();
    const elsewhere = fakeRouter("/texts/Tanakh", {}, {}, "/texts/$");
    expect(await createWorkspaceCommands(elsewhere.router, defaults).canonicalize()).toBe(false);
    expect(elsewhere.navigate).not.toHaveBeenCalled();
  });

  // CODE_REVIEW R-24: closing panel 1 must not hand its component (scroll, selection) to the panel that takes its place
  it("panels keep their key through operations; closing the first one leaves the second its own", async () => {
    const { router, navigate } = fakeRouter("/Genesis.1", { lang: "bi", p2: "Exodus.1" }, { panelKeys: ["kA", "kB"] });
    const cmd = createWorkspaceCommands(router, defaults);
    const ws = cmd.current();
    expect([ws.panels.p1!.key, ws.panels.p2!.key]).toEqual(["kA", "kB"]);
    const after = close(ws, "p1");
    expect(after.panels.p1!.ref).toBe("Exodus 1");
    expect(after.panels.p1!.key).toBe("kB");
    await cmd.go(after);
    expect((navigate.mock.calls[0]![0] as { state: { panelKeys: string[] } }).state.panelKeys).toEqual(["kB"]);
  });

  it("without keys in history state a panel is known by its position; a new panel gets a fresh key", () => {
    const ws = withPanelKeys(decodeWorkspace("Genesis 1", { p2: "Exodus.1" }), undefined);
    expect([ws.panels.p1!.key, ws.panels.p2!.key]).toEqual(["p1", "p2"]);
    expect(withPanelKeys(ws, ["a"]).panels.p1!.key).toBe("p1"); // a key list of the wrong length is ignored
  });
});
