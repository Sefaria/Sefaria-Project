import { describe, expect, it } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import { commentariesOn } from "./favourite-commentaries";
import { wordsIn } from "./words";

describe("wordsIn", () => {
  it("finds words with their offsets", () => {
    expect(wordsIn("בְּרֵאשִׁ֖ית בָּרָ֣א").map((w) => w.word)).toEqual(["בְּרֵאשִׁ֖ית", "בָּרָ֣א"]);
  });
  it("leaves quotes around a word out, and keeps gershayim inside it", () => {
    expect(wordsIn("“(Light)” רז״ל").map((w) => [w.word, w.start])).toEqual([["Light", 2], ["רז״ל", 10]]);
  });
});

describe("commentariesOn", () => {
  const link = (name: string, sourceRef: string, anchor: string, category = "Commentary") =>
    ({ category, index_title: `${name} on Genesis`, collectiveTitle: { en: name, he: "" }, sourceRef, anchorRefExpanded: [anchor] }) as unknown as RelatedLink;
  const links = [link("Ibn Ezra", "Ibn Ezra on Genesis 1:3:1", "Genesis 1:3"), link("Rashi", "Rashi on Genesis 1:3:1", "Genesis 1:3"), link("Rashi", "Rashi on Genesis 1:3:2", "Genesis 1:3"), link("Ramban", "Ramban on Genesis 1:4:1", "Genesis 1:4"), link("Onkelos", "Onkelos Genesis 1:3", "Genesis 1:3", "Targum")];

  it("lists each commentator on the verse once, favourites first", () => {
    expect(commentariesOn(links, "Genesis 1:3", ["Rashi"]).map((c) => [c.name, c.ref, c.favourite])).toEqual([
      ["Rashi", "Rashi on Genesis 1:3:1", true],
      ["Ibn Ezra", "Ibn Ezra on Genesis 1:3:1", false],
    ]);
  });
});
