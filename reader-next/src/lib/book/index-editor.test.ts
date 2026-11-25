import { describe, expect, it, vi } from "vitest";
import { indexDraft, indexPayload, markdownLinkTargets, parseYears, pollTask, subcategories, validateIndexDraft, yearString, type EditableIndex } from "./index-editor";

const index: EditableIndex = {
  title: "Rashi on Genesis", heTitle: 'רש"י על בראשית', titleVariants: ["Rashi Genesis"], heTitleVariants: [], categories: ["Tanakh", "Rishonim on Tanakh", "Rashi"],
  enDesc: "", authors: [{ en: "Rashi", slug: "rashi" }], dependence: "Commentary", compDate: [1075, 1105], collective_title: { en: "Rashi", he: 'רש"י' },
  base_text_titles: [{ en: "Genesis", slug: "genesis" }], sectionNames: ["Chapter", "Verse", "Comment"],
};

// @feature BOK-030
describe("index editor (the old EditTextInfo)", () => {
  it("reads and writes years as typed", () => {
    expect(yearString([1075, 1105])).toBe("1075-1105");
    expect(parseYears("-900--200")).toEqual([-900, -200]);
    expect(parseYears("1040")).toEqual([1040]);
    expect(parseYears("")).toEqual([]);
    expect(parseYears("1800-1797")).toBe("Invalid date format 1800 to 1797");
    expect(parseYears("soon")).toBe("Year must be an integer or range of integers.");
  });

  it("validates titles and categories as the old editor did", () => {
    const d = indexDraft(index);
    expect(validateIndexDraft(d)).toBeNull();
    expect(validateIndexDraft({ ...d, title: "Rashi 2" })).toMatch(/may not contain numbers/);
    expect(validateIndexDraft({ ...d, title: "Rashi-on" })).toMatch(/periods, hyphens or slashes/);
    expect(validateIndexDraft({ ...d, heTitle: "" })).toBe("Please give a Hebrew text title.");
    expect(validateIndexDraft({ ...d, categories: [] })).toBe("Please choose a text category.");
    expect(validateIndexDraft({ ...d, title: "רשי" })).toMatch(/primary title in English/);
    expect(validateIndexDraft({ ...d, compDate: "x" })).toMatch(/^Completion Year/);
  });

  it("posts what the old save posted: author slugs, oldTitle on a rename, dates only when changed", () => {
    const d = indexDraft(index);
    const same = indexPayload(index, d);
    expect(same).toMatchObject({ title: "Rashi on Genesis", authors: ["rashi"], base_text_titles: ["Genesis"], collective_title: "Rashi", sectionNames: ["Chapter", "Verse", "Comment"] });
    expect(same).not.toHaveProperty("oldTitle");
    expect(same).not.toHaveProperty("compDate");
    const changed = indexPayload(index, { ...d, title: "Rashi on Bereshit", compDate: "1070-1105", pubDate: "1475" });
    expect(changed).toMatchObject({ oldTitle: "Rashi on Genesis", compDate: [1070, 1105], pubDate: [1475] });
  });

  it("finds description links and category menus", () => {
    expect(markdownLinkTargets("See [x](/Genesis.1.1) and [y](/topics/shabbat) and [x](/Genesis.1.1)")).toEqual(["/Genesis.1.1", "/topics/shabbat"]);
    const tree = [{ category: "Tanakh", heCategory: "תנך", contents: [{ category: "Torah", heCategory: "תורה", contents: [] }, { title: "Genesis", heTitle: "בראשית", categories: ["Tanakh", "Torah"] }] }];
    expect(subcategories(tree as never, [])).toEqual(["Tanakh"]);
    expect(subcategories(tree as never, ["Tanakh"])).toEqual(["Torah"]);
    expect(subcategories(tree as never, ["Nope"])).toEqual([]);
  });

  it("polls a title change until it is done", async () => {
    const steps: string[] = [];
    const replies = [{ ready: false, meta: { step: "Renaming links" } }, { ready: true, state: "SUCCESS", result: { title: "Rashi on Bereshit" } }];
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => replies.shift() })));
    await expect(pollTask("t1", (s) => steps.push(s), async () => {})).resolves.toEqual({ title: "Rashi on Bereshit" });
    expect(steps).toEqual(["Renaming links"]);
    vi.unstubAllGlobals();
  });
});
