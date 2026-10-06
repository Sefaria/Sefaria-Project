import { describe, expect, it } from "vitest";
import { isHighlighted, planDisplay, type BookMeta } from "./plan";

const genesis: BookMeta = { book: "Genesis", indexTitle: "Genesis", textDepth: 2, addressTypes: ["Perek", "Pasuk"], sectionNames: ["Chapter", "Verse"], isComplex: false };
const berakhot: BookMeta = { book: "Berakhot", indexTitle: "Berakhot", textDepth: 2, addressTypes: ["Talmud", "Integer"], sectionNames: ["Daf", "Line"], isComplex: false };
const rashi: BookMeta = { book: "Rashi on Genesis", indexTitle: "Rashi on Genesis", textDepth: 3, addressTypes: ["Perek", "Pasuk", "Integer"], sectionNames: ["Chapter", "Verse", "Comment"], isComplex: false };
const kadesh: BookMeta = { book: "Pesach Haggadah, Kadesh", indexTitle: "Pesach Haggadah", textDepth: 1, addressTypes: ["Integer"], sectionNames: ["Paragraph"], isComplex: true };

// @feature TXD-003 @feature TXD-050
describe("planDisplay", () => {
  it("needs the API for unknown books", () => {
    expect(planDisplay("Genesis 1", undefined)).toEqual({ kind: "resolve" });
    expect(planDisplay("Gen 1", genesis)).toEqual({ kind: "resolve" });
  });

  it("shows a section as itself", () => {
    expect(planDisplay("Genesis 1", genesis)).toMatchObject({ kind: "sections", sectionRefs: ["Genesis 1"], highlight: null });
  });

  it("highlights a verse inside its chapter", () => {
    expect(planDisplay("Genesis 1:3", genesis)).toMatchObject({ sectionRefs: ["Genesis 1"], highlight: { from: ["1", "3"], to: ["1", "3"] } });
  });

  it("spans chapters for a cross-chapter verse range", () => {
    expect(planDisplay("Genesis 1:30-2:3", genesis)).toMatchObject({ sectionRefs: ["Genesis 1", "Genesis 2"] });
  });

  it("enumerates amudim for a Talmud range", () => {
    expect(planDisplay("Berakhot 2a-3b", berakhot)).toMatchObject({
      sectionRefs: ["Berakhot 2a", "Berakhot 2b", "Berakhot 3a", "Berakhot 3b"],
      highlight: null,
    });
  });

  it("sends a book or a commentary chapter to the API (first available section)", () => {
    expect(planDisplay("Genesis", genesis)).toEqual({ kind: "resolve" });
    expect(planDisplay("Rashi on Genesis 1", rashi)).toEqual({ kind: "resolve" });
  });

  it("treats a commentary verse as a section and a comment as a segment", () => {
    expect(planDisplay("Rashi on Genesis 1:1", rashi)).toMatchObject({ sectionRefs: ["Rashi on Genesis 1:1"], highlight: null });
    expect(planDisplay("Rashi on Genesis 1:1:2", rashi)).toMatchObject({ sectionRefs: ["Rashi on Genesis 1:1"], highlight: { from: ["1", "1", "2"] } });
  });

  it("treats a complex leaf node as its own section", () => {
    expect(planDisplay("Pesach Haggadah, Kadesh", kadesh)).toMatchObject({ sectionRefs: ["Pesach Haggadah, Kadesh"] });
    expect(planDisplay("Pesach Haggadah, Kadesh 2", kadesh)).toMatchObject({ sectionRefs: ["Pesach Haggadah, Kadesh"], highlight: { from: ["2"] } });
  });
});

describe("isHighlighted", () => {
  it("compares Talmud addresses by amud order", () => {
    const h = { from: ["2a", "5"], to: ["2b", "2"] };
    expect(isHighlighted(["2a", "5"], h, berakhot.addressTypes)).toBe(true);
    expect(isHighlighted(["2a", "14"], h, berakhot.addressTypes)).toBe(true);
    expect(isHighlighted(["2b", "3"], h, berakhot.addressTypes)).toBe(false);
    expect(isHighlighted(["2a", "4"], h, berakhot.addressTypes)).toBe(false);
  });
  it("returns false without a highlight", () => {
    expect(isHighlighted(["1", "1"], null, genesis.addressTypes)).toBe(false);
  });
});
