import { describe, expect, it } from "vitest";
import { leaves, type LayoutNode } from "~/lib/layout/tree";
import { close, closeAside, move, openAside, openAtEnd, openNextTo, openOnly, panelOrder, replace, updateAside, updatePanel, type NewPanel } from "./ops";
import { legacyColumnWidths, legacyRowSizes } from "./sizing";
import { EMPTY_WORKSPACE, type TextPanelState, type Workspace } from "./types";
import { decodeWorkspace, encodeWorkspace } from "./url";

const text = (ref: string, extra: Partial<TextPanelState> = {}): NewPanel => ({ kind: "text", ref, versions: {}, ...extra });
const refs = (ws: Workspace) => panelOrder(ws).map((id) => (ws.panels[id] as TextPanelState).ref);
const show = (n: LayoutNode | null): string =>
  !n ? "∅" : n.type === "leaf" ? n.id : `${n.direction === "row" ? "row" : "col"}(${n.children.map(show).join(",")})`;

describe("workspace operations", () => {
  // @feature SHL-043
  it("opening a text on its own replaces everything", () => {
    let ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1")), text("Exodus 1"));
    ws = openOnly(ws, text("Leviticus 1"));
    expect(refs(ws)).toEqual(["Leviticus 1"]);
  });

  // @feature SHL-044
  it("opens a panel after another, at the end, or into an empty workspace", () => {
    let ws = openNextTo(EMPTY_WORKSPACE, null, text("Genesis 1"));
    ws = openAtEnd(ws, text("Exodus 1"));
    ws = openNextTo(ws, "p1", text("Psalms 1"));
    expect(refs(ws)).toEqual(["Genesis 1", "Psalms 1", "Exodus 1"]);
  });

  it("replaces a panel in place with a new identity", () => {
    let ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1")), text("Exodus 1"));
    ws = replace(ws, "p1", text("Numbers 1"));
    expect(refs(ws)).toEqual(["Numbers 1", "Exodus 1"]);
    expect(panelOrder(ws)[0]).not.toBe("p1");
  });

  // @feature SHL-048
  it("closing a panel takes its side panels with it; closing the last empties the workspace", () => {
    let ws = openOnly(EMPTY_WORKSPACE, text("Genesis 1", { asides: [{ kind: "connections", view: "all" }] } as never));
    ws = openAtEnd(ws, text("Exodus 1"));
    ws = close(ws, "p1");
    expect(refs(ws)).toEqual(["Exodus 1"]);
    expect(Object.values(ws.panels).flatMap((p) => p.asides)).toEqual([]);
    ws = close(ws, panelOrder(ws)[0]!);
    expect(ws.layout).toBeNull();
  });

  it("updates one panel without touching the others", () => {
    let ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1")), text("Exodus 1"));
    const before = ws.panels.p2;
    ws = updatePanel(ws, "p1", { ref: "Genesis 1:5" });
    expect(refs(ws)).toEqual(["Genesis 1:5", "Exodus 1"]);
    expect(ws.panels.p2).toBe(before);
  });

  // @feature SHL-047
  describe("side panels belong to their panel", () => {
    it("opens one connections sidebar per panel, changing its view when opened again", () => {
      let ws = openOnly(EMPTY_WORKSPACE, text("Genesis 1:1"));
      ws = openAside(ws, "p1", { kind: "connections", view: "all" });
      ws = openAside(ws, "p1", { kind: "connections", view: "Rashi" });
      expect(ws.panels.p1!.asides).toEqual([{ id: "p1a1", kind: "connections", view: "Rashi" }]);
    });
    it("can hold two side panels (future: one above the other)", () => {
      let ws = openOnly(EMPTY_WORKSPACE, text("Genesis 1:1"));
      ws = openAside(ws, "p1", { kind: "connections", view: "Rashi" });
      ws = openAside(ws, "p1", { kind: "connections", view: "Sheets" }, { replaceExisting: false });
      expect(ws.panels.p1!.asides.map((a) => a.id)).toEqual(["p1a1", "p1a2"]);
      ws = closeAside(ws, "p1", "p1a1");
      expect(ws.panels.p1!.asides.map((a) => a.view)).toEqual(["Sheets"]);
    });
    it("updates and closes", () => {
      let ws = openAside(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), "p1", { kind: "connections", view: "all" });
      ws = updateAside(ws, "p1", "p1a1", { lang: "he" });
      expect(ws.panels.p1!.asides[0]!.lang).toBe("he");
      expect(closeAside(ws, "p1").panels.p1!.asides).toEqual([]);
    });
  });

  it("rearranges panels (future drag and drop): reorder, and stack one above another", () => {
    let ws = openAtEnd(openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1")), text("Exodus 1")), text("Leviticus 1"));
    ws = move(ws, "p1", "p3", "after");
    expect(refs(ws)).toEqual(["Exodus 1", "Leviticus 1", "Genesis 1"]);
    ws = move(ws, "p1", "p2", "below");
    expect(show(ws.layout)).toBe("row(col(p2,p1),p3)");
  });

  it("ignores operations on panels that do not exist", () => {
    const ws = openOnly(EMPTY_WORKSPACE, text("Genesis 1"));
    expect(close(ws, "p9")).toBe(ws);
    expect(updatePanel(ws, "p9", { ref: "x" })).toBe(ws);
    expect(openAside(ws, "p9", { kind: "connections", view: "all" })).toBe(ws);
  });
});

// @feature SHL-039
describe("legacy sizing", () => {
  it("matches the old reader's ratios (verified on sefaria.org at 1600px: 592/416/592)", () => {
    expect(legacyColumnWidths(["main", "aside"])).toEqual([0.68, 0.32]);
    expect(legacyColumnWidths(["main", "aside", "main"])).toEqual([0.37, 0.26, 0.37]);
    expect(legacyColumnWidths(["main", "main", "aside"])).toEqual([0.37, 0.37, 0.26]);
    expect(legacyColumnWidths(["main", "main", "main", "aside"])).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it("groups a sidebar with its panel", () => {
    const s = legacyRowSizes([{ asides: [{} as never] }, { asides: [] }]);
    expect(s.panels.map((x) => +x.toFixed(2))).toEqual([0.63, 0.37]);
    expect(s.inner[0]!.map((x) => +x.toFixed(4))).toEqual([0.5873, 0.4127]); // 37 : 26
    expect(s.inner[1]).toEqual([1]);
  });
  it("one panel alone fills the row", () => {
    expect(legacyRowSizes([{ asides: [] }])).toEqual({ panels: [1], inner: [[1]] });
  });
});

// @feature SHL-066 @feature RTE-044 @feature RTE-043
describe("URL codec (old grammar)", () => {
  it("reads a single text with its sidebar", () => {
    const ws = decodeWorkspace("Genesis 1:3", { lang: "en", with: "Rashi" });
    expect(ws.panels.p1).toEqual({ id: "p1", kind: "text", ref: "Genesis 1:3", versions: { primary: undefined, translation: undefined }, lang: "en", asides: [{ id: "p1a1", kind: "connections", view: "Rashi" }] });
  });

  it("reads the old client's gapped numbering (?with=all&p3=…) that the old server dropped", () => {
    const ws = decodeWorkspace("Genesis 1:1", { lang: "en", with: "all", p3: "Exodus.1", lang3: "en" });
    expect(refs(ws)).toEqual(["Genesis 1:1", "Exodus 1"]);
    expect((ws.panels.p2 as TextPanelState).lang).toBe("en");
  });

  it("reads per-panel sidebars, versions and aliyot", () => {
    const ws = decodeWorkspace("Genesis 1", { p2: "Exodus.1", lang2: "en", aliyot2: "0", p3: "Leviticus.1.3", w3: "Rashi", vhe3: "hebrew|Miqra_according_to_the_Masorah" });
    expect(refs(ws)).toEqual(["Genesis 1", "Exodus 1", "Leviticus 1:3"]);
    const p3 = ws.panels.p3 as TextPanelState;
    expect(p3.asides[0]!.view).toBe("Rashi");
    expect(p3.versions.primary).toBe("hebrew|Miqra according to the Masorah");
    expect((ws.panels.p2 as TextPanelState).aliyot).toBe(0);
  });

  // @feature SHL-052 Version filter state in sidebar @feature VER-013
  // @feature RTE-045
  it("reads and writes the previewed translation (vside) in both forms the old site uses", () => {
    const a = decodeWorkspace("Genesis 1:1", { lang: "en", vside: "The_Koren_Jerusalem_Bible|en", with: "Translation Open" });
    expect(a.panels.p1!.asides[0]).toEqual({ id: "p1a1", kind: "connections", view: "Translation Open", vside: "The Koren Jerusalem Bible|en" });
    const b = decodeWorkspace("Genesis 1:1", { vside: "The_Koren_Jerusalem_Bible", with: "Translation Open" }); // the anchor form, no language
    expect(b.panels.p1!.asides[0]!.vside).toBe("The Koren Jerusalem Bible");
    expect(encodeWorkspace(a)).toEqual({ path: "/Genesis.1.1", search: { lang: "en", vside: "The_Koren_Jerusalem_Bible|en", with: "Translation Open" } });
    // second panel
    const c = decodeWorkspace("Genesis 1", { p2: "Exodus.1", w2: "Translation Open", vside2: "Foo_Bar|en" });
    expect(c.panels.p2!.asides[0]!.vside).toBe("Foo Bar|en");
    expect(encodeWorkspace(c)!.search).toMatchObject({ vside2: "Foo_Bar|en", w2: "Translation Open" });
  });

  // @feature CON-042 @feature TXD-059
  // @feature SRC-095
  it("reads and writes the sidebar search query (sbsq, sbsq2 for the second panel)", () => {
    const ws = decodeWorkspace("Genesis 1:1", { sbsq: "light", with: "SidebarSearch" });
    expect(ws.panels.p1!.asides[0]).toEqual({ id: "p1a1", kind: "connections", view: "SidebarSearch", sbsq: "light" });
    expect(encodeWorkspace(ws)).toEqual({ path: "/Genesis.1.1", search: { sbsq: "light", with: "SidebarSearch" } });
    expect(decodeWorkspace("Genesis 1", { p2: "Exodus.1", w2: "SidebarSearch", sbsq2: "light" }).panels.p2!.asides[0]!.sbsq).toBe("light");
  });

  it("reads and writes the words being looked up (lookup), as the old site does", () => {
    const ws = decodeWorkspace("Genesis 1:1", { lang: "he", lookup: "בְּרֵאשִׁ֖ית", with: "Lexicon" });
    expect(ws.panels.p1!.asides[0]).toEqual({ id: "p1a1", kind: "connections", view: "Lexicon", lookup: "בְּרֵאשִׁ֖ית" });
    expect(encodeWorkspace(ws)).toEqual({ path: "/Genesis.1.1", search: { lang: "he", lookup: "בְּרֵאשִׁ֖ית", with: "Lexicon" } });
    expect(decodeWorkspace("Genesis 1", { p2: "Exodus.1", w2: "Lexicon", lookup2: "אבא" }).panels.p2!.asides[0]!.lookup).toBe("אבא");
  });

  it("switching a side panel's view drops what the old view carried (a previewed version)", () => {
    let ws = openAside(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), "p1", { kind: "connections", view: "Translation Open", vside: "X|en", lang: "he" });
    ws = openAside(ws, "p1", { kind: "connections", view: "Translations" });
    expect(ws.panels.p1!.asides).toEqual([{ id: "p1a1", kind: "connections", view: "Translations", lang: "he" }]);
  });

  it("lang2 is panel 2's language when there is a p2, otherwise the first sidebar's", () => {
    expect(decodeWorkspace("Genesis 1:1", { with: "all", lang2: "he" }).panels.p1!.asides[0]!.lang).toBe("he");
    const ws = decodeWorkspace("Genesis 1:1", { with: "all", lang2: "en", p2: "Exodus.1" });
    expect(ws.panels.p1!.asides[0]!.lang).toBeUndefined();
    expect((ws.panels.p2 as TextPanelState).lang).toBe("en");
  });

  it("writes sequential numbers the old server can read", () => {
    const ws = decodeWorkspace("Genesis 1:1", { lang: "en", with: "all", p3: "Exodus.1", lang3: "en" });
    expect(encodeWorkspace(ws)).toEqual({ path: "/Genesis.1.1", search: { lang: "en", with: "all", p2: "Exodus.1", lang2: "en" } });
  });

  it("round-trips", () => {
    const search = { lang: "bi", with: "Rashi", p2: "Exodus.1", lang2: "en", aliyot2: "1", p3: "Leviticus.1.3", w3: "Sheets", vhe3: "hebrew|Miqra_according_to_the_Masorah" };
    const ws = decodeWorkspace("Genesis 1:3", search);
    const out = encodeWorkspace(ws)!;
    expect(out.path).toBe("/Genesis.1.3");
    expect(decodeWorkspace("Genesis 1:3", out.search)).toEqual(ws);
  });

  it("ignores empty or unknown parameters", () => {
    expect(leaves(decodeWorkspace("Genesis 1", { p2: "", foo: "bar" }).layout)).toEqual(["p1"]);
  });
});
