import { describe, expect, it } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import { parseSearch } from "~/lib/reader/search-serializer";
import { closeAside, close, openAside, updatePanel } from "~/lib/workspace/ops";
import { decodeWorkspace, workspaceUrl } from "~/lib/workspace/url";
import {
  companionRefAt,
  keepsBookmarkFlag,
  layoutHasCompanions,
  layoutModified,
  layoutSearchOf,
  placeCompanions,
  standardWorkspace,
  stripBookmarkFlag,
  workspaceFromLayout,
} from "./layout";

const berakhot = () =>
  decodeWorkspace("Berakhot 2a:1", parseSearch("lang=bi&p2=Rashi_on_Berakhot.2a.1.1&lang2=he&layout=r(1~67,2~33)&lookup=foo&bk=1"));

const link = (index_title: string, sourceRef: string, anchorRef: string) => ({ index_title, sourceRef, anchorRef, anchorRefExpanded: [anchorRef] }) as RelatedLink;

describe("layoutSearchOf", () => {
  it("keeps companions, languages and arrangement, and drops panel 1's ref and volatile bits", () => {
    const search = layoutSearchOf(berakhot());
    expect(search).toEqual({ lang: "bi", p2: "Rashi_on_Berakhot.2a.1.1", lang2: "he", layout: "r(1~67,2~33)" });
    expect(layoutHasCompanions(search)).toBe(true);
    expect(layoutHasCompanions(layoutSearchOf(decodeWorkspace("Berakhot 2a", {})))).toBe(false);
  });
  it("counts a sidebar as a companion", () => {
    expect(layoutHasCompanions(layoutSearchOf(openAside(decodeWorkspace("Genesis 1:1", {}), "p1", { kind: "connections", view: "Rashi" })))).toBe(true);
  });
});

describe("layoutModified", () => {
  const saved = layoutSearchOf(berakhot());
  it("ignores where panels have scrolled", () => {
    let ws = updatePanel(berakhot(), "p2", { ref: "Rashi on Berakhot 3a:4:1" });
    ws = updatePanel(ws, "p1", { ref: "Berakhot 3a:4" });
    expect(layoutModified(ws, saved)).toBe(false);
  });
  it("notices a closed companion, a language change and a resize", () => {
    expect(layoutModified(close(berakhot(), "p2"), saved)).toBe(true);
    expect(layoutModified(updatePanel(berakhot(), "p2", { lang: "en" }), saved)).toBe(true);
    expect(layoutModified(decodeWorkspace("Berakhot 2a:1", { ...saved, layout: "r(1~50,2~50)" }), saved)).toBe(true);
    expect(layoutModified(closeAside(berakhot(), "p1"), saved)).toBe(false);
  });
});

describe("restoring", () => {
  it("rebuilds the saved layout around a new position, flagged as mine", () => {
    const ws = workspaceFromLayout("Berakhot 5b:2", layoutSearchOf(berakhot()));
    expect(ws.bk).toBe(true);
    expect(ws.panels.p1).toMatchObject({ ref: "Berakhot 5b:2", lang: "bi" });
    expect(ws.panels.p2).toMatchObject({ ref: "Rashi on Berakhot 2a:1:1", lang: "he" });
    expect(workspaceUrl(ws)).toContain("&bk=1");
  });
  it("moves companions through the verse's links", () => {
    const ws = workspaceFromLayout("Berakhot 5b:2", layoutSearchOf(berakhot()));
    const placed = placeCompanions(ws, [link("Rashi on Berakhot", "Rashi on Berakhot 5b:2:1", "Berakhot 5b:2")]);
    expect(placed.panels.p2!.ref).toBe("Rashi on Berakhot 5b:2:1");
  });
  it("standard is the main text alone, without its own language", () => {
    const ws = standardWorkspace(berakhot());
    expect(Object.keys(ws.panels)).toEqual(["p1"]);
    expect(ws.panels.p1).toMatchObject({ ref: "Berakhot 2a:1", asides: [] });
    expect(ws.panels.p1!.lang).toBeUndefined();
    expect(ws.bk).toBeUndefined();
  });
});

describe("companionRefAt", () => {
  const links = [
    link("Tosafot on Berakhot", "Tosafot on Berakhot 2a:3:1", "Berakhot 2a:3"),
    link("Rashi on Berakhot", "Rashi on Berakhot 2a:1:1-2", "Berakhot 2a:1"),
    link("Rashi on Berakhot", "Rashi on Berakhot 2a:5:1", "Berakhot 2a:5"),
  ];
  it("takes the comment on the verse", () => {
    expect(companionRefAt(links, "Berakhot 2a:1", "Rashi on Berakhot 9b:1:1")).toBe("Rashi on Berakhot 2a:1:1");
  });
  it("else the nearest comment after it in the section, or the last one", () => {
    expect(companionRefAt(links, "Berakhot 2a:2", "Rashi on Berakhot 9b:1:1")).toBe("Rashi on Berakhot 2a:5:1");
    expect(companionRefAt(links, "Berakhot 2a:9", "Rashi on Berakhot 9b:1:1")).toBe("Rashi on Berakhot 2a:5:1");
    expect(companionRefAt(links, "Berakhot 2a", "Tosafot on Berakhot 9b:1:1")).toBe("Tosafot on Berakhot 2a:3:1");
  });
  it("else the commentary's same section, and other books stay where they were", () => {
    expect(companionRefAt([], "Berakhot 2a:4", "Rashi on Berakhot 9b:1:1")).toBe("Rashi on Berakhot 2a");
    expect(companionRefAt([], "Berakhot 2a:4", "Mishnah Berakhot 1:1")).toBe("Mishnah Berakhot 1:1");
    expect(companionRefAt([], "Berakhot 2a:4", "Berakhot 7a:1")).toBe("Berakhot 2a:4");
  });
});

describe("the bk flag", () => {
  it("lasts while panel 1 shows the same book", () => {
    const ws = berakhot();
    expect(keepsBookmarkFlag(ws, close(ws, "p2"))).toBe(true);
    expect(keepsBookmarkFlag(ws, updatePanel(ws, "p1", { ref: "Berakhot 40a" }))).toBe(true);
    expect(keepsBookmarkFlag(ws, close(ws, "p1"))).toBe(false);
    expect(keepsBookmarkFlag(ws, updatePanel(ws, "p1", { ref: "Shabbat 2a" }))).toBe(false);
    expect(keepsBookmarkFlag({ ...ws, bk: undefined }, ws)).toBe(false);
  });
  it("is left out of shared links", () => {
    expect(stripBookmarkFlag("https://x/Berakhot.2a.1?lang=bi&bk=1")).toBe("https://x/Berakhot.2a.1?lang=bi");
    expect(stripBookmarkFlag("https://x/Berakhot.2a.1?bk=1&lang=bi")).toBe("https://x/Berakhot.2a.1?lang=bi");
    expect(stripBookmarkFlag("https://x/Berakhot.2a.1?bk=1")).toBe("https://x/Berakhot.2a.1");
    expect(stripBookmarkFlag("https://x/Berakhot.2a.1?lang=bi")).toBe("https://x/Berakhot.2a.1?lang=bi");
  });
});
