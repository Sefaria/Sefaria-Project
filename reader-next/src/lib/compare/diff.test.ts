// @feature LEG-010
import { describe, expect, it } from "vitest";
import { applyChange, changeMessage, diffSegments, filterText, validateDiff } from "./diff";

describe("filterText (DiffStore.FilterText)", () => {
  it("drops tags and maps each character to the tag characters before it", () => {
    const f = filterText("ab<b>cd</b>e");
    expect(f.filteredText).toBe("abcde");
    expect(f.mapping).toEqual([0, 0, 3, 3, 7]);
  });
});

describe("validateDiff", () => {
  it("a change inside a tag-free run is applicable, one across a tag is not", () => {
    const f = filterText("ab<i>cd</i>");
    expect(validateDiff(f, [[0, "a"], [1, "bc"], [0, "d"]])).toEqual([[0, "a"], [2, "bc"], [0, "d"]]);
    expect(validateDiff(f, [[1, "ab"], [0, "cd"]])).toEqual([[1, "ab"], [0, "cd"]]);
  });
});

describe("diffSegments (DiffRow.generateDiff)", () => {
  it("identical texts are one equal piece on each side", () => {
    const d = diffSegments("same", "same");
    expect(d.v1).toEqual([[0, "same"]]);
    expect(d.v2).toEqual([[0, "same"]]);
  });
  it("aligns an insertion with an empty piece on the other side", () => {
    const d = diffSegments("abcd", "abXcd");
    expect(d.v1).toEqual([[0, "ab"], [1, "", "X"], [0, "cd"]]);
    expect(d.v2).toEqual([[0, "ab"], [1, "X", ""], [0, "cd"]]);
  });
  it("keeps the old quirk: the empty side of an insertion before the last character is not applicable", () => {
    // ValidateDiff compares mapping[at] with mapping[at + 1], which is past the end there
    const d = diffSegments("abc", "abXc");
    expect(d.v1).toEqual([[0, "ab"], [2, ""], [0, "c"]]);
    expect(d.v2).toEqual([[0, "ab"], [2, "X"], [0, "c"]]);
  });
  it("a replacement faces its counterpart", () => {
    const d = diffSegments("cat", "cut");
    expect(d.v1).toEqual([[0, "c"], [1, "a", "u"], [0, "t"]]);
  });
  it("matches the old page on Genesis 1:7 (Masorah vs Ta'amei Hamikra, VERIFIED 2026-11-04 on www.sefaria.org)", () => {
    // the vowel the old page marks depends on diff-match-patch's time limit being on (its half-match pass)
    const a = "וַיַּ֣עַשׂ אֱלֹהִים֮ אֶת־הָרָקִ֒יעַ֒ וַֽ֒יְהִי";
    const b = "וַיַּ֣עַשׂ אֱלֹהִים֮ אֶת־הָרָקִיעַ֒ וַֽיְהִי";
    const d = diffSegments(a, b);
    expect(d.v1.length).toBe(d.v2.length);
    expect(d.v1.map((p) => p[1]).join("")).toBe(a);
    expect(d.v2.map((p) => p[1]).join("")).toBe(b);
  });
  it("a change that crosses a tag is not applicable on either side", () => {
    const d = diffSegments("ab<i>c</i>", "aX");
    expect(d.v1.some((p) => p[0] === 2)).toBe(true);
    expect(d.v2.some((p) => p[0] === 2)).toBe(true);
  });
});

describe("applyChange (DiffCell.acceptChange)", () => {
  it("replaces a piece in the raw text, keeping tags", () => {
    const d = diffSegments("<b>ab</b>c", "<b>aX</b>c");
    const i = d.v1.findIndex((p) => p[0] === 1);
    expect(applyChange(d.f1, d.v1, i, "X")).toBe("<b>aX</b>c");
  });
  it("an insertion at the very end lands at the end (the old page put it in front)", () => {
    const d = diffSegments("ab", "abc");
    const i = d.v1.findIndex((p) => p[0] === 1);
    expect(applyChange(d.f1, d.v1, i, "c")).toBe("abc");
  });
});

it("changeMessage words as the old page", () => {
  expect(changeMessage("", "x")).toBe("Click to add `x`");
  expect(changeMessage("x", "")).toBe("Click to remove `x`");
  expect(changeMessage("a", "b")).toBe("Click to change `a` to `b`");
});
