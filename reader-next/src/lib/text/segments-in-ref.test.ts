import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { containingSectionRef, segmentsInRef } from "./segments-in-ref";
import { normaliseTexts, type RawTextsResponse } from "./model";

// @feature CON-032
describe("containingSectionRef", () => {
  it.each([
    ["Rashi on Genesis 1:1:2", "Rashi on Genesis 1:1"],
    ["Mishnah Berakhot 1:1", "Mishnah Berakhot 1"],
    ["Berakhot 2a:3", "Berakhot 2a"],
    ["Jerusalem Talmud Berakhot 1:1:1", "Jerusalem Talmud Berakhot 1:1"],
    ["Rashi on Genesis 1:1:1-3", "Rashi on Genesis 1:1"],
  ])("%s → %s", (ref, section) => expect(containingSectionRef(ref)).toBe(section));

  it("never widens a one-level ref to a whole book", () => {
    expect(containingSectionRef("Pesach Haggadah, Kadesh 2")).toBe("Pesach Haggadah, Kadesh 2");
    expect(containingSectionRef("Genesis 1")).toBe("Genesis 1");
    expect(containingSectionRef("Genesis")).toBe("Genesis");
  });
});

describe("segmentsInRef", () => {
  const rashi = normaliseTexts(readFixture<RawTextsResponse>("rashi-on-genesis-1/section-first.json"));
  it("finds one comment", () => {
    expect(segmentsInRef(rashi, "Rashi on Genesis 1:1:2").map((s) => s.ref)).toEqual(["Rashi on Genesis 1:1:2"]);
  });
  it("finds a range of comments", () => {
    expect(segmentsInRef(rashi, "Rashi on Genesis 1:1:1-3").map((s) => s.ref)).toEqual(["Rashi on Genesis 1:1:1", "Rashi on Genesis 1:1:2", "Rashi on Genesis 1:1:3"]);
  });
  it("finds nothing for a ref outside the section", () => {
    expect(segmentsInRef(rashi, "Rashi on Genesis 1:9:1")).toEqual([]);
  });
  it("a section ref yields all its segments", () => {
    expect(segmentsInRef(rashi, "Rashi on Genesis")).toHaveLength(rashi.segments.length);
  });
});
