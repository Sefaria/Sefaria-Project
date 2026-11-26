import { describe, expect, it, vi } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import type { CommentaryMeta } from "~/lib/text/commentary";
import { linkPanels, openAtEnd, openOnly, setLinkAway, type NewPanel } from "~/lib/workspace/ops";
import { EMPTY_WORKSPACE, type PanelId, type TextPanelState, type Workspace } from "~/lib/workspace/types";
import type { NavState } from "./navigation";
import { createLinkBus, type LinkEndpoint } from "./links";

const text = (ref: string): NewPanel => ({ kind: "text", ref, versions: {} });
const META: Record<string, CommentaryMeta> = {
  Genesis: { title: "Genesis" },
  Exodus: { title: "Exodus" },
  "Rashi on Genesis": { title: "Rashi on Genesis", dependence: "Commentary", base_text_titles: ["Genesis"], base_text_mapping: "many_to_one", collective_title: "Rashi" },
  "Rashi on Exodus": { title: "Rashi on Exodus", dependence: "Commentary", base_text_titles: ["Exodus"], base_text_mapping: "many_to_one", collective_title: "Rashi" },
};
const LINKS: Record<string, RelatedLink[]> = {
  "Genesis 1": [
    { anchorRef: "Genesis 1:3", anchorRefExpanded: ["Genesis 1:3"], sourceRef: "Rashi on Genesis 1:3:1", commentaryNum: 3.0001 },
    { anchorRef: "Genesis 1:5", anchorRefExpanded: ["Genesis 1:5"], sourceRef: "Rashi on Genesis 1:5:1", commentaryNum: 5.0001 },
  ] as RelatedLink[],
};

/** A fake workspace and two fake panels whose DOM holds the given segments. */
function harness(ws0: Workspace, loaded: Record<PanelId, string[]>) {
  let ws = ws0;
  const navs: { ws: Workspace; state?: NavState }[] = [];
  const go = vi.fn(async (next: Workspace, opts: { state?: NavState }) => {
    ws = next;
    navs.push({ ws: next, state: opts.state });
  });
  const bus = createLinkBus({ current: () => ws, go, meta: async (t) => META[t], links: async (s) => LINKS[s] ?? [] });
  const places: Record<string, string | undefined> = {};
  const scrolled: { panel: PanelId; ref: string }[] = [];
  for (const id of Object.keys(loaded) as PanelId[]) {
    const ep: LinkEndpoint = {
      indexTitle: () => (ws.panels[id] as TextPanelState).ref.replace(/ [\d:a-b-]+$/, ""),
      place: () => places[id],
      scrollTo: (ref) => {
        if (!loaded[id]!.includes(ref)) return false;
        places[id] = ref;
        scrolled.push({ panel: id, ref });
        return true;
      },
    };
    bus.register(id, ep);
  }
  return { bus, navs, scrolled, places, ws: () => ws };
}

const genesisWithRashi = () => linkPanels(openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), text("Rashi on Genesis 1:1:1")), "p2", "p1");

// @feature SHL-090 Linked panels
describe("the link bus", () => {
  it("moving the text moves the commentary to its comment on that verse, and only the address catches up", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:3"], p2: ["Rashi on Genesis 1:3:1"] });
    h.bus.moved("p1", "Genesis 1:3");
    await h.bus.idle();
    expect(h.scrolled).toEqual([{ panel: "p2", ref: "Rashi on Genesis 1:3:1" }]);
    expect(h.navs.at(-1)!.state).toEqual({ nav: "scroll", panel: "p2", link: true });
    expect((h.ws().panels.p2 as TextPanelState).ref).toBe("Rashi on Genesis 1:3:1");
  });

  it("moving the commentary moves the text to the verse it comments on", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:5"], p2: ["Rashi on Genesis 1:5:1"] });
    h.bus.moved("p2", "Rashi on Genesis 1:5:1");
    await h.bus.idle();
    expect(h.scrolled).toEqual([{ panel: "p1", ref: "Genesis 1:5" }]);
  });

  it("a verse with no comment: the commentary holds its place (D3)", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:4"], p2: ["Rashi on Genesis 1:3:1"] });
    h.bus.moved("p1", "Genesis 1:4");
    await h.bus.idle();
    expect(h.scrolled).toEqual([]);
    expect(h.navs).toEqual([]);
  });

  it("a target that is not loaded: the other panel is sent there (one replaced entry)", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:3"], p2: [] });
    h.bus.moved("p1", "Genesis 1:3");
    await h.bus.idle();
    expect(h.navs.at(-1)!.state).toEqual({ nav: "go", panel: "p2", link: true });
    expect((h.ws().panels.p2 as TextPanelState).ref).toBe("Rashi on Genesis 1:3:1");
  });

  it("waits for the moved panel's own address update before writing the other's", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:3"], p2: ["Rashi on Genesis 1:3:1"] });
    let release!: () => void;
    const written = new Promise<void>((r) => (release = r));
    h.bus.moved("p1", "Genesis 1:3", written);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.navs).toEqual([]);
    release();
    await h.bus.idle();
    expect(h.navs).toHaveLength(1);
  });

  it("a paused link passes nothing on", async () => {
    const h = harness(setLinkAway(genesisWithRashi(), "p2", true), { p1: ["Genesis 1:3"], p2: ["Rashi on Genesis 1:3:1"] });
    h.bus.moved("p1", "Genesis 1:3");
    await h.bus.idle();
    expect(h.scrolled).toEqual([]);
  });

  it("a move the other side cannot follow (the text went to another book) pauses the link (P1)", async () => {
    const ws = genesisWithRashi();
    const h = harness({ ...ws, panels: { ...ws.panels, p1: { ...(ws.panels.p1 as TextPanelState), ref: "Exodus 1:1" } } }, { p1: ["Exodus 1:1"], p2: [] });
    h.bus.moved("p1", "Exodus 1:1");
    await h.bus.idle();
    expect(h.ws().panels.p2!.link).toEqual({ to: "p1", away: true });
  });

  it("a newer move overtakes an older one still waiting on the network", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:3", "Genesis 1:5"], p2: ["Rashi on Genesis 1:3:1", "Rashi on Genesis 1:5:1"] });
    h.bus.moved("p1", "Genesis 1:3");
    h.bus.moved("p1", "Genesis 1:5");
    await h.bus.idle();
    expect(h.scrolled.map((s) => s.ref)).toEqual(["Rashi on Genesis 1:5:1"]);
  });

  it("two versions of the same text follow segment for segment", async () => {
    const ws = linkPanels(openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), text("Genesis 1:1")), "p2", "p1");
    const h = harness(ws, { p1: ["Genesis 1:7"], p2: ["Genesis 1:7"] });
    h.bus.moved("p1", "Genesis 1:7");
    await h.bus.idle();
    expect(h.scrolled).toEqual([{ panel: "p2", ref: "Genesis 1:7" }]);
  });
});

// @feature SHL-091 Link symbol (pause and link again)
describe("the link symbol", () => {
  it("pauses a link, and linking again brings the other panel to the one the reader moved last", async () => {
    const h = harness(genesisWithRashi(), { p1: ["Genesis 1:5"], p2: ["Rashi on Genesis 1:3:1", "Rashi on Genesis 1:5:1"] });
    h.bus.toggle("p2");
    await h.bus.idle();
    expect(h.ws().panels.p2!.link?.away).toBe(true);
    h.places.p1 = "Genesis 1:5";
    h.bus.moved("p1", "Genesis 1:5"); // paused: nothing follows, but it is the panel touched last
    await h.bus.idle();
    expect(h.scrolled).toEqual([]);
    h.bus.toggle("p2");
    await h.bus.idle();
    expect(h.ws().panels.p2!.link).toEqual({ to: "p1" });
    expect(h.scrolled).toEqual([{ panel: "p2", ref: "Rashi on Genesis 1:5:1" }]);
  });

  it("linking again after the commentary moved to another book brings it back to the text's book", async () => {
    const ws0 = setLinkAway(genesisWithRashi(), "p2", true);
    const ws = { ...ws0, panels: { ...ws0.panels, p2: { ...(ws0.panels.p2 as TextPanelState), ref: "Rashi on Exodus 1:1:1" } } };
    const h = harness(ws, { p1: ["Genesis 1:3"], p2: [] });
    h.places.p1 = "Genesis 1:3";
    h.bus.toggle("p2");
    await h.bus.idle();
    const p2 = h.ws().panels.p2 as TextPanelState;
    expect(p2.ref).toBe("Rashi on Genesis 1:3:1");
    expect(p2.link).toEqual({ to: "p1" });
  });
});

// @feature SHL-092 Opening a commentary, targum or version links it
describe("auto-link on Open", () => {
  it("links a commentary opened beside its text", async () => {
    const ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), text("Rashi on Genesis 1:1:1"));
    const h = harness(ws, { p1: [], p2: [] });
    h.bus.autoLink("p1", "p2", "Rashi on Genesis 1:1:1");
    await h.bus.idle();
    expect(h.ws().panels.p2!.link).toEqual({ to: "p1" });
    expect(h.navs[0]!.state).toEqual({ nav: "stay", link: true });
  });

  it("does not link unrelated texts (P3)", async () => {
    const ws = openAtEnd(openOnly(EMPTY_WORKSPACE, text("Genesis 1:1")), text("Psalms 104:1"));
    const h = harness(ws, { p1: [], p2: [] });
    h.bus.autoLink("p1", "p2", "Psalms 104:1");
    await h.bus.idle();
    expect(h.ws().panels.p2!.link).toBeUndefined();
  });
});
