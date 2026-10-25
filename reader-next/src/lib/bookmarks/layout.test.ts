import { describe, expect, it } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import { parseSearch } from "~/lib/reader/search-serializer";
import { closeAside, close, drop, openAside, openAtEnd, panelOrder, updatePanel } from "~/lib/workspace/ops";
import { decodeWorkspace, workspaceUrl } from "~/lib/workspace/url";
import {
  bookmarkEntry,
  companionRefAt,
  keepsBookmarkFlag,
  layoutAutosave,
  layoutHasCompanions,
  layoutModified,
  layoutSearchOf,
  mainPanelOf,
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
  it("leaves the Resources sidebar out", () => {
    const withSidebar = openAside(decodeWorkspace("Genesis 1:1", {}), "p1", { kind: "connections", view: "Rashi" });
    expect(layoutSearchOf(withSidebar)).toEqual(layoutSearchOf(decodeWorkspace("Genesis 1:1", {})));
    expect(layoutHasCompanions({ lang: "bi", with: "Rashi" })).toBe(true);
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

describe("bookmarkEntry", () => {
  const saved = { lang: "he", p2: "Steinsaltz_on_Berakhot.5a.2", lang2: "he", layout: "r(1~65.6,2~34.4)" };
  it("opens the saved layout at the bookmark, flagged as mine, in the link itself", () => {
    const url = workspaceUrl(bookmarkEntry(saved, "Berakhot 5a:3"))!;
    expect(url).toBe("/Berakhot.5a.3?lang=he&p2=Steinsaltz_on_Berakhot.5a.2&lang2=he&layout=r(1~65.6,2~34.4)&bk=1");
  });
  it("opens the main text alone when the layout has nothing beside it", () => {
    expect(workspaceUrl(bookmarkEntry({ lang: "he" }, "Berakhot 5a:3"))).toBe("/Berakhot.5a.3?lang=bi");
    expect(workspaceUrl(bookmarkEntry(undefined, "Berakhot 5a:3"))).toBe("/Berakhot.5a.3?lang=bi");
  });
  it("keeps a version asked for by the link", () => {
    const ws = bookmarkEntry(saved, "Berakhot 5a:3", { vhe: "hebrew|William_Davidson_Edition_-_Vocalized_Aramaic" });
    expect(ws.panels.p1).toMatchObject({ versions: { primary: "hebrew|William Davidson Edition - Vocalized Aramaic" } });
    expect(ws.bk).toBe(true);
  });
});

describe("layoutAutosave", () => {
  const plain = (ref = "Berakhot 2a:1") => decodeWorkspace(ref, { lang: "bi" });
  const saved = layoutSearchOf(berakhot());
  it("saves a closed companion or a resize while My layout is on", () => {
    expect(layoutAutosave(berakhot(), { ...close(berakhot(), "p2"), bk: true }, saved, "Berakhot")).toEqual({ save: { lang: "bi" }, adopt: false });
    const resized = decodeWorkspace("Berakhot 2a:1", { ...saved, layout: "r(1~50,2~50)", bk: "1" });
    expect(layoutAutosave(berakhot(), resized, saved, "Berakhot")?.save.layout).toBe("r(1~50,2~50)");
  });
  it("leaves the bookmark alone when only positions changed", () => {
    const scrolled = updatePanel(updatePanel(berakhot(), "p1", { ref: "Berakhot 3a:4" }), "p2", { ref: "Rashi on Berakhot 3a:4:1" });
    expect(layoutAutosave(berakhot(), scrolled, saved, "Berakhot")).toBeUndefined();
  });
  it("never touches a saved layout from the standard layout", () => {
    const standard = { ...berakhot(), bk: undefined };
    expect(layoutAutosave(plain(), standard, saved, "Berakhot")).toBeUndefined();
    expect(layoutAutosave(standard, close(standard, "p2"), saved, "Berakhot")).toBeUndefined();
  });
  it("adopts a first companion opened beside a bookmark that has no layout yet", () => {
    const opened = { ...berakhot(), bk: undefined };
    expect(layoutAutosave(plain(), opened, { lang: "bi" }, "Berakhot")).toEqual({ save: saved, adopt: true });
    expect(layoutAutosave(plain(), opened, undefined, "Berakhot")?.adopt).toBe(true);
  });
  it("does not adopt on arrival or when the main text changed book", () => {
    const opened = { ...berakhot(), bk: undefined };
    expect(layoutAutosave(undefined, opened, undefined, "Berakhot")).toBeUndefined();
    expect(layoutAutosave(plain("Shabbat 2a:1"), opened, undefined, "Berakhot")).toBeUndefined();
  });
});

describe("the main text anywhere in the arrangement", () => {
  const isBookmarked = (book: string) => book === "Berakhot";
  const mainLeft = () => decodeWorkspace("Berakhot 5a:3", parseSearch("lang=he&p2=Steinsaltz_on_Berakhot.5a.2&lang2=he&layout=r(1~59.4,2~40.6)&bk=1"));
  const moved = () => drop(mainLeft(), "p1", { kind: "swap", target: "p2" });
  const mainRight = () => ({ ...moved(), bk: true as const });

  it("is the first bookmarked panel in reading order, else panel 1", () => {
    expect(mainPanelOf(mainRight(), isBookmarked)?.id).toBe("p2");
    expect(mainPanelOf(mainRight(), () => false)?.id).toBe("p1");
    expect(mainPanelOf(mainRight(), () => true)?.id).toBe("p1");
  });

  it("reopens with Berakhot still right of Steinsaltz, at the same widths", () => {
    const saved = layoutSearchOf(mainRight(), undefined, "Berakhot");
    expect(saved.p1).toBe("Steinsaltz_on_Berakhot.5a.2");
    const ws = bookmarkEntry(saved, "Berakhot 7b:4");
    expect(panelOrder(ws).map((id) => ws.panels[id]!.ref)).toEqual(["Steinsaltz on Berakhot 5a:2", "Berakhot 7b:4"]);
    expect(ws.layout).toEqual(mainRight().layout);
    expect(ws.bk).toBe(true);
    expect(workspaceUrl(ws)).toBe("/Steinsaltz_on_Berakhot.5a.2?lang=he&p2=Berakhot.7b.4&lang2=he&layout=r(1~59.4,2~40.6)&bk=1");
    expect(layoutModified(ws, saved, undefined, "Berakhot")).toBe(false);
  });

  it("gives a version asked for by the link to the main text, wherever it is", () => {
    const saved = layoutSearchOf(mainRight(), undefined, "Berakhot");
    const ws = bookmarkEntry(saved, "Berakhot 7b:4", { vhe: "hebrew|William_Davidson_Edition_-_Vocalized_Aramaic" });
    expect(ws.panels.p2!.versions.primary).toBe("hebrew|William Davidson Edition - Vocalized Aramaic");
    expect(ws.panels.p1!.versions.primary).toBeUndefined();
  });

  it("autosaves a swap made while My layout is on", () => {
    const before = layoutSearchOf(mainLeft());
    expect(before.p1).toBeUndefined();
    const change = layoutAutosave(mainLeft(), mainRight(), before, "Berakhot");
    expect(change).toEqual({ save: layoutSearchOf(mainRight(), undefined, "Berakhot"), adopt: false });
    const scrolled = updatePanel(mainRight(), "p2", { ref: "Berakhot 6a:1" });
    expect(layoutAutosave(mainRight(), scrolled, change!.save, "Berakhot")).toBeUndefined();
  });

  it("keeps the bk flag through a swap and other companion changes, and drops it when the main text changes book", () => {
    expect(keepsBookmarkFlag(mainLeft(), moved(), isBookmarked)).toBe(true);
    const ws = mainRight();
    expect(keepsBookmarkFlag(ws, close(ws, "p1"), isBookmarked)).toBe(true);
    expect(keepsBookmarkFlag(ws, openAtEnd(ws, { kind: "text", ref: "Rashi on Berakhot 5a:3:1", versions: {} }), isBookmarked)).toBe(true);
    expect(keepsBookmarkFlag(ws, decodeWorkspace("Steinsaltz on Berakhot 5a:2", { p2: "Berakhot.5a.3", layout: "r(1~30,2~70)" }), isBookmarked)).toBe(true);
    expect(keepsBookmarkFlag(ws, updatePanel(ws, "p1", { ref: "Steinsaltz on Berakhot 9a:1" }), isBookmarked)).toBe(true);
    expect(keepsBookmarkFlag(ws, updatePanel(ws, "p2", { ref: "Berakhot 40a" }), isBookmarked)).toBe(true);
    expect(keepsBookmarkFlag(ws, updatePanel(ws, "p2", { ref: "Shabbat 2a" }), isBookmarked)).toBe(false);
  });

  it("places companions at the main text's verse when the main text is not panel 1", () => {
    const ws = workspaceFromLayout("Berakhot 7b:4", layoutSearchOf(mainRight(), undefined, "Berakhot"));
    const placed = placeCompanions(ws, [link("Steinsaltz on Berakhot", "Steinsaltz on Berakhot 7b:4", "Berakhot 7b:4")], "Berakhot");
    expect(placed.panels.p1!.ref).toBe("Steinsaltz on Berakhot 7b:4");
    expect(placed.panels.p2!.ref).toBe("Berakhot 7b:4");
  });

  it("switches to the standard layout around the main text", () => {
    expect(Object.values(standardWorkspace(mainRight(), "Berakhot").panels).map((p) => p.ref)).toEqual(["Berakhot 5a:3"]);
  });

  it("opens layouts saved without p1 with the main text first, as before", () => {
    const old = { lang: "he", p2: "Steinsaltz_on_Berakhot.5a.2", lang2: "he", layout: "r(1~59.4,2~40.6)" };
    const ws = bookmarkEntry(old, "Berakhot 7b:4");
    expect(panelOrder(ws).map((id) => ws.panels[id]!.ref)).toEqual(["Berakhot 7b:4", "Steinsaltz on Berakhot 5a:2"]);
    expect(workspaceUrl(ws)).toBe("/Berakhot.7b.4?lang=he&p2=Steinsaltz_on_Berakhot.5a.2&lang2=he&layout=r(1~59.4,2~40.6)&bk=1");
  });
});
