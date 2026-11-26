import { describe, expect, it } from "vitest";
import { close, linkedTo, linkPanels, linksOf, move, openAtEnd, openNextToWithId, openOnly, panelOrder, replace, setLinkAway, unlinkPanel, type NewPanel } from "./ops";
import { EMPTY_WORKSPACE, type TextPanelState, type Workspace } from "./types";
import { decodeWorkspace, encodeWorkspace, parseLinks, workspaceUrl } from "./url";

const text = (ref: string): NewPanel => ({ kind: "text", ref, versions: {} });
const two = (): Workspace => linkPanels(openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:3")), text("Rashi on Genesis 1:3:1")), "p2", "p1");

// @feature SHL-090 Linked panels
describe("linked panels: workspace operations", () => {
  it("links a panel to another, pauses and resumes the link, and unlinks", () => {
    let ws = two();
    expect(linksOf(ws)).toEqual([{ follower: "p2", leader: "p1", away: false }]);
    expect(linkedTo(ws, "p1")).toEqual([{ other: "p2", follower: "p2", away: false }]);
    ws = setLinkAway(ws, "p2", true);
    expect(linksOf(ws)[0]!.away).toBe(true);
    ws = setLinkAway(ws, "p2", false);
    expect(ws.panels.p2!.link).toEqual({ to: "p1" });
    expect(linksOf(unlinkPanel(ws, "p2"))).toEqual([]);
  });

  it("refuses a link to itself or to a panel that is not open", () => {
    const ws = openOnly(EMPTY_WORKSPACE, text("Genesis 1"));
    expect(linkPanels(ws, "p1", "p1")).toBe(ws);
    expect(linkPanels(ws, "p1", "p4")).toBe(ws);
  });

  it("a link follows its panels when a panel opens before them (ids follow position)", () => {
    const [ws] = openNextToWithId(two(), "p1", text("Exodus 1"), "before");
    expect(panelOrder(ws).map((id) => (ws.panels[id] as TextPanelState).ref)).toEqual(["Exodus 1", "Genesis 1:3", "Rashi on Genesis 1:3:1"]);
    expect(linksOf(ws)).toEqual([{ follower: "p3", leader: "p2", away: false }]);
  });

  it("closing either panel ends the link; closing a third keeps it", () => {
    expect(linksOf(close(two(), "p1"))).toEqual([]);
    expect(linksOf(close(two(), "p2"))).toEqual([]);
    const three = openAtEnd(two(), text("Exodus 1"));
    expect(linksOf(close(three, "p3"))).toEqual([{ follower: "p2", leader: "p1", away: false }]);
  });

  it("replacing a panel ends the links to it (it is a different thing)", () => {
    expect(linksOf(replace(two(), "p1", text("Psalms 1")))).toEqual([]);
  });

  it("moving the panels keeps the link between the same two", () => {
    const ws = move(two(), "p2", "p1", "before");
    expect((ws.panels.p1 as TextPanelState).ref).toBe("Rashi on Genesis 1:3:1");
    expect(linksOf(ws)).toEqual([{ follower: "p1", leader: "p2", away: false }]);
  });

  it("opening a text on its own drops every link", () => {
    expect(linksOf(openOnly(two(), text("Genesis 2")))).toEqual([]);
  });
});

// @feature SHL-090 Linked panels
describe("linked panels: the address", () => {
  it("writes `link=<follower>-<leader>` last, before the reserved context, and reads it back", () => {
    const url = workspaceUrl(two());
    expect(url).toBe("/Genesis.1.3?lang=bi&aliyot=0&p2=Rashi_on_Genesis.1.3.1&lang2=bi&link=2-1");
    const back = decodeWorkspace("Genesis 1:3", encodeWorkspace(two())!.search);
    expect(back.panels.p2!.link).toEqual({ to: "p1" });
  });

  it("writes a paused link with `~`", () => {
    expect(encodeWorkspace(setLinkAway(two(), "p2", true))!.search.link).toBe("2-1~");
    expect(decodeWorkspace("Genesis 1:3", { p2: "Rashi_on_Genesis.1.3.1", link: "2-1~" }).panels.p2!.link).toEqual({ to: "p1", away: true });
  });

  it("counts panels by their place in the row, not by the p<n> numbers a sidebar shifts", () => {
    // [Genesis + sidebar, Rashi]: Rashi is written p3, but it is the second panel
    const ws = decodeWorkspace("Genesis 1:3", { with: "all", lang2: "en", p3: "Rashi_on_Genesis.1.3.1", link: "2-1" });
    expect(ws.panels.p2!.link).toEqual({ to: "p1" });
    expect(encodeWorkspace(ws)!.search.link).toBe("2-1");
  });

  it("an address without links is unchanged (sefaria.org's own grammar)", () => {
    const ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:3")), text("Rashi on Genesis 1:3:1"));
    expect(encodeWorkspace(ws)!.search).not.toHaveProperty("link");
  });

  it("ignores malformed, self, out-of-range and repeated entries", () => {
    expect(parseLinks("2-1,2-3,3-3,9-1,x,1-2~,", 3)).toEqual([
      { follower: 2, leader: 1, away: false },
      { follower: 1, leader: 2, away: true },
    ]);
    expect(parseLinks(undefined, 3)).toEqual([]);
  });
});
