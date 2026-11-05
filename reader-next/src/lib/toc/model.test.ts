import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tocStructures, type TocIndexRecord, type TocItem } from "./model";

const load = (dir: string): TocIndexRecord => JSON.parse(readFileSync(`fixtures/api/${dir}/index-contracted.json`, "utf8"));
const flat = (items: TocItem[]): TocItem[] => items.flatMap((i) => [i, ...("children" in i ? flat(i.children) : [])]);
const links = (items: TocItem[]) => flat(items).flatMap((i) => (i.kind === "links" || i.kind === "letters" ? i.links : []));

// @feature BOK-018 @feature BOK-011
describe("table of contents: Genesis (Torah: chapters and portions together)", () => {
  const [s, ...rest] = tocStructures(load("genesis-1"), { ref: "Genesis 2:3", sectionRef: "Genesis 2" });
  it("has one structure, no toggle", () => expect(rest).toEqual([]));
  it("lists fifty chapters under a Chapters heading, current one marked", () => {
    const grid = s!.items.find((i) => i.kind === "links");
    expect(grid && grid.kind === "links" && grid.heading?.en).toBe("Chapters");
    const chapters = links(s!.items.filter((i) => i.kind === "links"));
    expect(chapters).toHaveLength(50);
    expect(chapters[1]).toEqual({ label: { en: "2", he: "ב" }, ref: "Genesis 2", current: true });
    expect(chapters.filter((c) => c.current)).toHaveLength(1);
  });
  // @feature BOK-015
  it("then the Torah Portions, each with its aliyot, never collapsible", () => {
    const portions = s!.items.find((i) => i.kind === "group" && i.title.en === "Torah Portions");
    expect(portions && portions.kind === "group" && portions.collapsible).toBe(false);
    const bereshit = flat(s!.items).find((i) => i.kind === "group" && i.title.en === "Bereshit");
    expect(bereshit && bereshit.kind === "group" && bereshit.collapsible).toBe(false);
    expect(bereshit && bereshit.kind === "group" && bereshit.ref).toBe("Genesis 1:1");
    const aliyot = bereshit && bereshit.kind === "group" ? links(bereshit.children) : [];
    expect(aliyot.map((a) => a.label.en)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(aliyot[0]).toMatchObject({ ref: "Genesis 1:1-2:3", current: true }); // 2:3 closes the first aliyah
    expect(aliyot[1]).toMatchObject({ ref: "Genesis 2:4-2:19", current: false });
  });
});

describe("Genesis 2:3 is the first aliyah's, not the second's", () => {
  it("marks only the aliyah holding the verse", () => {
    const [s] = tocStructures(load("genesis-1"), { ref: "Genesis 2:3", sectionRef: "Genesis 2" });
    const aliyot = flat(s!.items).filter((i) => i.kind === "links" && i.links[0]?.ref.startsWith("Genesis 1:1-"));
    expect(aliyot.flatMap((i) => (i.kind === "links" ? i.links.filter((l) => l.current).map((l) => l.label.en) : []))).toEqual(["1"]);
  });
});

// @feature BOK-015 @feature BOK-017
describe("Berakhot: Chapters is the default structure, Talmud dafs inside", () => {
  const structures = tocStructures(load("berakhot-2a"), { ref: "Berakhot 3b:2", sectionRef: "Berakhot 3b" });
  it("offers only Chapters: the index excludes the plain schema", () => {
    expect(structures.map((s) => s.key)).toEqual(["Chapters"]);
  });
  it("chapter one's dafs are 2a … 13a with the current one marked, ranges kept as links", () => {
    const ch1 = structures[0]!.items[0]!;
    expect(ch1.kind === "group" && ch1.title.en).toBe("Chapter 1; MeEimatai");
    const l = ch1.kind === "group" ? links(ch1.children) : [];
    expect(l[0]).toMatchObject({ label: { en: "2a", he: "ב." }, ref: "Berakhot 2a:1-14" });
    expect(l.at(-1)).toMatchObject({ label: { en: "13a" } });
    expect(l.filter((x) => x.current).map((x) => x.label.en)).toEqual(["3b"]);
  });
  it("the plain structure skips the empty 1a/1b and starts at 2a", () => {
    const l = links(tocStructures({ ...load("berakhot-2a"), exclude_structs: [] }, {}).find((s) => s.key === "schema")!.items);
    expect(l[0]).toMatchObject({ label: { en: "2a" }, ref: "Berakhot 2a" });
    expect(l).toHaveLength(125);
  });
});

// @feature BOK-010
describe("a complex text (Pesach Haggadah): a title per node, linking straight to content", () => {
  it("one link per section, the one the reader is in marked", () => {
    const [s] = tocStructures(load("pesach-haggadah-kadesh"), { ref: "Pesach Haggadah, Kadesh 3", sectionRef: "Pesach Haggadah, Kadesh" });
    const titles = s!.items.filter((i) => i.kind === "link");
    expect(titles.length).toBeGreaterThanOrEqual(10);
    expect(titles[0]).toMatchObject({ title: { en: "Kadesh", he: "קדש" }, ref: "Pesach Haggadah, Kadesh", current: true });
    expect(titles.filter((t) => t.kind === "link" && t.current)).toHaveLength(1);
  });
});

// @feature BOK-011 @feature BOK-016 @feature BOK-017
describe("single-schema books", () => {
  it("Mishneh Torah: a Chapter grid", () => {
    const [s] = tocStructures(load("mishneh-torah-foundations-1"), { ref: "Mishneh Torah, Foundations of the Torah 2:1", sectionRef: "Mishneh Torah, Foundations of the Torah 2" });
    const l = links(s!.items);
    expect(l).toHaveLength(10);
    expect(l[1]).toMatchObject({ ref: "Mishneh Torah, Foundations of the Torah 2", current: true });
  });
  it("Zohar leaves out its excluded schema, defaults to Daf", () => {
    const keys = tocStructures(load("zohar-bereshit-1")).map((s) => s.key);
    expect(keys[0]).toBe("Daf");
    expect(keys).not.toContain("schema");
  });
  it("Jastrow: browse by letter", () => {
    const [s] = tocStructures(load("jastrow-abba-1"), { sectionRef: "Jastrow, א" });
    const letters = flat(s!.items).find((i) => i.kind === "letters");
    expect(letters && letters.kind === "letters" && letters.links[0]).toMatchObject({ label: { en: "א" }, ref: "Jastrow, א" });
  });
});

// @feature BOK-012 @feature BOK-013
describe("deep and zoomed arrays (ported rules; synthetic records: no recorded book has these)", () => {
  const rec = (schema: object): TocIndexRecord => ({ title: "Book", schema: { nodeType: "JaggedArrayNode", ...schema } });
  it("three levels: a heading per non-empty top section, its chapters beneath", () => {
    const [s] = tocStructures(rec({ depth: 3, sectionNames: ["Volume", "Chapter", "Verse"], addressTypes: ["Integer", "Integer", "Integer"], content_counts: [[2, 3], [0, 0], [4]] }), { sectionRef: "Book 1:2" });
    expect(s!.items).toHaveLength(1);
    const top = s!.items[0]!;
    const sections = top.kind === "section" ? top.children : [];
    expect(sections.map((c) => c.kind === "section" && c.name.en)).toEqual(["Volume 1", "Volume 3"]); // the empty one is skipped
    expect(links(s!.items).map((l) => l.ref)).toEqual(["Book 1:1", "Book 1:2", "Book 3:1"]);
    expect(links(s!.items).filter((l) => l.current).map((l) => l.ref)).toEqual(["Book 1:2"]);
  });
  it("toc_zoom: links stop at the coarser level, ending at the first non-empty deeper address", () => {
    const [s] = tocStructures(rec({ depth: 3, toc_zoom: 2, sectionNames: ["Chapter", "Section", "Line"], addressTypes: ["Integer", "Integer", "Integer"], content_counts: [[[0, 2], [1]], [[3]]] }), { sectionRef: "Book 1:2:1" });
    const l = links(s!.items);
    expect(l.map((x) => x.ref)).toEqual(["Book 1:1:2", "Book 2:1:1"]); // chapter 1's first non-empty branch is its second line
    expect(l.filter((x) => x.current)).toEqual([]);
  });
});
