import { describe, expect, it } from "vitest";
import { textOnly, withAssetsFrom } from "~/lib/surfaces/workspace-view";
import { close, linkPanels, linksOf, openAtEnd, openOnly, panelOrder, type NewPanel } from "./ops";
import { EMPTY_WORKSPACE, type TextPanelState, type Workspace } from "./types";
import { decodeWorkspace, encodeWorkspace, workspaceUrl } from "./url";

const text = (ref: string): NewPanel => ({ kind: "text", ref, versions: {} });
const withAsset = (): Workspace => linkPanels(openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), { kind: "asset", asset: "sample:seven-days" }), "p2", "p1");

// @feature SHL-093 Asset panel
describe("asset panels in the workspace", () => {
  it("are written a<n> in the panel's slot, and read back", () => {
    expect(workspaceUrl(withAsset())).toBe("/Genesis.1.1?lang=bi&aliyot=0&a2=sample:seven-days&link=2-1");
    const back = decodeWorkspace("Genesis 1:1", encodeWorkspace(withAsset())!.search);
    expect(back.panels.p2).toMatchObject({ kind: "asset", asset: "sample:seven-days", link: { to: "p1" } });
  });

  it("keep their place among texts and sidebars (the slot numbering is sefaria.org's)", () => {
    const ws = decodeWorkspace("Genesis 1:1", { with: "all", lang2: "en", a3: "abc-123", p4: "Exodus.1", lang4: "bi" });
    expect(panelOrder(ws).map((id) => ws.panels[id]!.kind)).toEqual(["text", "asset", "text"]);
    expect(encodeWorkspace(ws)!.search).toMatchObject({ with: "all", a3: "abc-123", p4: "Exodus.1" });
  });

  it("a text wins a slot that names both", () => {
    expect(decodeWorkspace("Genesis 1:1", { p2: "Exodus.1", a2: "x" }).panels.p2!.kind).toBe("text");
  });

  it("closing the text closes the asset that follows it", () => {
    const ws = close(withAsset(), "p1");
    expect(panelOrder(ws)).toEqual([]);
    const three = openAtEnd(withAsset(), text("Exodus 1"));
    expect(panelOrder(close(three, "p1")).map((id) => (three.panels[id] as TextPanelState | undefined)?.kind)).toHaveLength(1);
  });
});

// @feature SHL-093 Asset panel
describe("what a surface sees (SurfaceHost 1.x has text panels only)", () => {
  it("the workspace without its asset panels, renumbered", () => {
    const ws = openAtEnd(withAsset(), text("Exodus 1"));
    const view = textOnly(ws);
    expect(panelOrder(view as Workspace).map((id) => view.panels[id]!.ref)).toEqual(["Genesis 1:1", "Exodus 1"]);
    expect(Object.keys(view.panels)).toEqual(["p1", "p2"]);
  });

  it("puts the assets back beside their texts when a surface navigates to a workspace it built", () => {
    const current = { ...withAsset(), panels: { ...withAsset().panels, p1: { ...withAsset().panels.p1!, key: "kG" } } } as Workspace;
    const fromSurface = openAtEnd(textOnly(current) as Workspace, text("Exodus 1"));
    const next = withAssetsFrom(fromSurface, current);
    expect(panelOrder(next).map((id) => next.panels[id]!.kind)).toEqual(["text", "asset", "text"]);
    expect(linksOf(next)).toEqual([{ follower: "p2", leader: "p1", away: false }]);
  });

  it("drops an asset whose text the surface closed", () => {
    const current = withAsset();
    const next = withAssetsFrom(openOnly(EMPTY_WORKSPACE, text("Psalms 1")), current);
    expect(panelOrder(next).map((id) => next.panels[id]!.kind)).toEqual(["text"]);
  });
});
