import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { commentaryToBase, indexMetaQueryOptions, type CommentaryMeta } from "./commentary";

const rashi: CommentaryMeta = { title: "Rashi on Genesis", dependence: "Commentary", base_text_titles: ["Genesis"], base_text_mapping: "many_to_one", collectiveTitle: "Rashi" };
const tosafot: CommentaryMeta = { title: "Tosafot on Berakhot", dependence: "Commentary", base_text_titles: ["Berakhot"], base_text_mapping: "many_to_one", collective_title: "Tosafot" };

// @feature TXT-015 @feature SHL-045 @feature RTE-063
describe("commentary ref → base text + commentary (verified on sefaria.org)", () => {
  it("a comment opens its verse with the commentator selected", () => {
    expect(commentaryToBase("Rashi on Genesis 1:1:4", rashi)).toEqual({ ref: "Genesis 1:1", filter: "Rashi" });
    expect(commentaryToBase("Tosafot on Berakhot 2a:1:1", tosafot)).toEqual({ ref: "Berakhot 2a:1", filter: "Tosafot" });
  });
  it("ranges keep their shape", () => {
    expect(commentaryToBase("Rashi on Genesis 1:1:2-3", rashi)).toEqual({ ref: "Genesis 1:1", filter: "Rashi" });
    expect(commentaryToBase("Rashi on Genesis 1:1:2-2:3", rashi)).toEqual({ ref: "Genesis 1:1-2", filter: "Rashi" });
  });
  it("section-level refs open as their own text unless forced", () => {
    expect(commentaryToBase("Rashi on Genesis 1:1", rashi)).toBeNull();
    expect(commentaryToBase("Rashi on Genesis 1:1", rashi, { force: true })).toEqual({ ref: "Genesis 1:1", filter: "Rashi" });
  });
  it("one_to_one mappings keep every section", () => {
    expect(commentaryToBase("Onkelos Genesis 1:1:1", { title: "Onkelos Genesis", dependence: "Commentary", base_text_titles: ["Genesis"], base_text_mapping: "one_to_one", collectiveTitle: "Onkelos" })).toEqual({ ref: "Genesis 1:1:1", filter: "Onkelos" });
  });
  it("not a single-base commentary, a complex node, or the wrong book: no conversion", () => {
    expect(commentaryToBase("Mishnah Berakhot 1:1:1", { title: "Mishnah Berakhot" })).toBeNull();
    expect(commentaryToBase("Rashi on Genesis 1:1:4", { ...rashi, base_text_titles: ["Genesis", "Exodus"] })).toBeNull();
    expect(commentaryToBase("Ramban on Genesis, Introduction 1:1:1", { ...rashi, title: "Ramban on Genesis" })).toBeNull();
    expect(commentaryToBase("Rashi on Genesis 1:1:4", undefined)).toBeNull();
  });
  it("reads the index record from the API (recorded)", async () => {
    const qc = makeQueryClient();
    const meta = await qc.fetchQuery(indexMetaQueryOptions("Rashi on Genesis"));
    expect(commentaryToBase("Rashi on Genesis 1:1:4", meta)).toEqual({ ref: "Genesis 1:1", filter: "Rashi" });
  });
});
