import { describe, expect, it } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import { baseToDependent, dependentToBase, firstSegment, relationOf, sectionOf, type DependentMeta } from "./link-map";

// Index records as /api/v2/raw/index returns them (checked live 2026-11-27)
const rashi: DependentMeta = { title: "Rashi on Genesis", dependence: "Commentary", base_text_titles: ["Genesis"], base_text_mapping: "many_to_one", collective_title: "Rashi" };
const onkelos: DependentMeta = { title: "Onkelos Genesis", dependence: "Targum", base_text_titles: ["Genesis"], base_text_mapping: "one_to_one", collective_title: "Onkelos" };
const rashiBerakhot: DependentMeta = { title: "Rashi on Berakhot", dependence: "Commentary", base_text_titles: ["Berakhot"], base_text_mapping: "many_to_one", collective_title: "Rashi" };

const link = (anchorRef: string, sourceRef: string, commentaryNum = 0, anchorRefExpanded = [anchorRef]): RelatedLink =>
  ({ _id: sourceRef, index_title: "", category: "Commentary", type: "commentary", ref: sourceRef, anchorRef, anchorRefExpanded, sourceRef, sourceHeRef: "", anchorVerse: 0, sourceHasEn: true, commentaryNum, collectiveTitle: { en: "Rashi", he: "" } }) as RelatedLink;

// @feature SHL-090 Linked panels
describe("which texts can be linked", () => {
  it("the same text (two versions) and a commentary or targum on it", () => {
    expect(relationOf({ title: "Genesis" }, { title: "Genesis" })).toEqual({ mode: "same" });
    expect(relationOf({ title: "Genesis" }, { title: "Rashi on Genesis", meta: rashi })).toEqual({ mode: "dependent", base: "a", dependent: rashi });
    expect(relationOf({ title: "Onkelos Genesis", meta: onkelos }, { title: "Genesis" })).toEqual({ mode: "dependent", base: "b", dependent: onkelos });
  });

  it("not a commentary on another book, nor two unrelated texts (P3: parallels do not link)", () => {
    expect(relationOf({ title: "Exodus" }, { title: "Rashi on Genesis", meta: rashi })).toBeNull();
    expect(relationOf({ title: "Genesis" }, { title: "Psalms" })).toBeNull();
    expect(relationOf({ title: "Genesis" }, { title: "Ramban on Genesis", meta: { title: "Ramban on Genesis", dependence: "Commentary", base_text_titles: ["Genesis"] } })).toBeNull(); // no mapping
  });
});

// @feature SHL-090 Linked panels
describe("mapping a place across a link", () => {
  it("commentary → base, by structure (many-to-one drops the comment number; one-to-one keeps it)", () => {
    expect(dependentToBase("Rashi on Genesis 1:3:2", rashi)).toBe("Genesis 1:3");
    expect(dependentToBase("Rashi on Genesis 1:3:1-2", rashi)).toBe("Genesis 1:3");
    expect(dependentToBase("Onkelos Genesis 1:3", onkelos)).toBe("Genesis 1:3");
    expect(dependentToBase("Rashi on Berakhot 2a:3:1", rashiBerakhot)).toBe("Berakhot 2a:3");
    expect(dependentToBase("Rashi on Exodus 1:1:1", rashi)).toBeNull();
  });

  it("base → commentary: the first comment on that verse, in the server's order", () => {
    const links = [link("Genesis 1:3", "Rashi on Genesis 1:3:2", 3.0002), link("Genesis 1:3", "Rashi on Genesis 1:3:1", 3.0001), link("Genesis 1:3", "Ramban on Genesis 1:3:1", 3.0001), link("Genesis 1:4", "Rashi on Genesis 1:4:1", 4.0001)];
    expect(baseToDependent("Genesis 1:3", rashi, links)).toBe("Rashi on Genesis 1:3:1");
    expect(baseToDependent("Genesis 1:4", rashi, links)).toBe("Rashi on Genesis 1:4:1");
  });

  it("ignores comments elsewhere that quote the verse (live: Genesis 2:4 is cited by Rashi on Genesis 1:1:3 and 17:24:1)", () => {
    const links = [link("Genesis 2:4", "Rashi on Genesis 1:1:3", 1.0003), link("Genesis 2:4", "Rashi on Genesis 17:24:1", 24.0001), link("Genesis 2:4", "Rashi on Genesis 2:4:1", 4.0001)];
    expect(baseToDependent("Genesis 2:4", rashi, links)).toBe("Rashi on Genesis 2:4:1");
    expect(baseToDependent("Genesis 2:4", rashi, links.slice(0, 2))).toBeNull();
  });

  it("a verse the commentary says nothing on: no target, the commentary panel holds (D3)", () => {
    expect(baseToDependent("Genesis 1:5", rashi, [link("Genesis 1:3", "Rashi on Genesis 1:3:1")])).toBeNull();
  });

  it("a comment spanning verses answers each of them, at its first segment", () => {
    const span = link("Genesis 1:1-2", "Rashi on Genesis 1:1:1-2", 1.0001, ["Genesis 1:1", "Genesis 1:2"]);
    expect(baseToDependent("Genesis 1:2", rashi, [span])).toBe("Rashi on Genesis 1:1:1");
  });

  it("helpers: first segment of a range, section of a segment", () => {
    expect(firstSegment("Rashi on Genesis 1:3:1-2")).toBe("Rashi on Genesis 1:3:1");
    expect(firstSegment("Genesis 1:3")).toBe("Genesis 1:3");
    expect(sectionOf("Genesis 1:3")).toBe("Genesis 1");
    expect(sectionOf("Berakhot 2a:3")).toBe("Berakhot 2a");
  });
});
