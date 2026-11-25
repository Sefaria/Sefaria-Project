// @feature TOP-012 @feature TOP-013 @feature TOP-014 @feature TOP-008 @feature TOP-004 @feature TOP-030
import { describe, expect, it } from "vitest";
import {
  azFiltered,
  azLetters,
  azSlice,
  deckPoolSize,
  describedDeck,
  filterApplies,
  generalPool,
  shouldDisplayInModule,
  sortTopicsCompare,
  stripNikkud,
  topicCard,
  topicSuggestions,
  type TopicListItem,
} from "./topic-model";

const t = (slug: string, en: string, he: string, extra: Partial<TopicListItem> = {}): TopicListItem => ({
  slug,
  primaryTitle: { en, he },
  shouldDisplay: true,
  pools: ["library", "sheets"],
  ...extra,
});

describe("shouldDisplayInModule (Sefaria.shouldDisplayInActiveModule)", () => {
  it("needs shouldDisplay and the module's pool (Voices reads the sheets pool)", () => {
    expect(shouldDisplayInModule(t("a", "A", "א"))).toBe(true);
    expect(shouldDisplayInModule(t("a", "A", "א", { shouldDisplay: false }))).toBe(false);
    expect(shouldDisplayInModule(t("a", "A", "א", { pools: ["sheets"] }))).toBe(false);
    expect(shouldDisplayInModule(t("a", "A", "א", { pools: ["sheets"] }), "voices")).toBe(true);
    expect(shouldDisplayInModule(undefined)).toBe(false);
  });
  it("the general pool follows the interface language", () => {
    expect(generalPool("en")).toBe("general_en");
    expect(generalPool("he")).toBe("general_he");
  });
});

describe("sortTopicsCompare (Sefaria.sortTopicsCompareFn)", () => {
  it("orders by displayOrder, a top-level slug counting as 10000", () => {
    const list = [t("c", "C", "ג", { displayOrder: 20 }), t("b", "B", "ב", { displayOrder: 5 }), t("top", "Top", "ט", { displayOrder: 1 })];
    expect(list.sort(sortTopicsCompare("en", new Set(["top"]))).map((x) => x.slug)).toEqual(["b", "c", "top"]);
  });
  it("ties go alphabetically in the interface language, a leading quote or # ignored", () => {
    const list = [t("z", "Zion", "ציון"), t("q", '"Avot"', "אבות"), t("h", "#Bet", "בית")];
    expect([...list].sort(sortTopicsCompare("en")).map((x) => x.slug)).toEqual(["q", "h", "z"]);
    expect([...list].sort(sortTopicsCompare("he")).map((x) => x.slug)).toEqual(["q", "h", "z"]);
  });
  it("in Hebrew a topic without a Hebrew title goes last", () => {
    const list = [t("x", "Alpha", ""), t("y", "Beta", "בטא")];
    expect(list.sort(sortTopicsCompare("he")).map((x) => x.slug)).toEqual(["y", "x"]);
  });
});

describe("topicCard (TopicTOCCard)", () => {
  it("a category links to its category page with its category description", () => {
    const c = topicCard({ ...t("torah-portions", "Torah Portions", "פרשות השבוע", { description: { en: "d" }, categoryDescription: { en: "cd" } }), isCategory: true });
    expect(c).toMatchObject({ href: "/topics/category/torah-portions", description: { en: "cd" }, isCategory: true });
  });
  it("a topic links to its page with its description, without 'Parashat '", () => {
    const c = topicCard(t("parashat-noach", "Parashat Noach", "פרשת נח", { description: { en: "d" } }));
    expect(c).toMatchObject({ href: "/topics/parashat-noach", title: { en: "Noach", he: "נח" }, description: { en: "d" } });
  });
  it("no card for a topic missing a title in either language", () => {
    expect(topicCard(t("x", "X", ""))).toBeNull();
  });
});

describe("A–Z (TopicPageAll)", () => {
  const list = [
    t("aaron", "Aaron", "אהרן", { titles: [{ text: "Aaron", lang: "en" }, { text: "אהרן", lang: "he" }] }),
    t("abba", "Abba", "אבא", { titles: [{ text: "Abba", lang: "en" }] }),
    t("hidden", "Abe", "אייב", { shouldDisplay: false }),
    t("sheets-only", "Abi", "אבי", { pools: ["sheets"] }),
    t("ben", "ben Zoma", "בן זומא", { titles: [{ text: "ben Zoma", lang: "en" }, { text: "Aaron's friend", lang: "en" }] }),
    t("noen", "", "אברך", { titles: [{ text: "אברך", lang: "he" }, { text: "Avrekh aaron", lang: "en" }] }),
  ];
  it("the letters: A–Z, or א–ת without four of the five final forms (the old list forgot ם, so it shows)", () => {
    expect(azLetters("en")).toHaveLength(26);
    expect(azLetters("he")).toHaveLength(23);
    for (const f of ["ך", "ן", "ף", "ץ"]) expect(azLetters("he")).not.toContain(f);
    expect(azLetters("he")).toContain("ם");
  });
  it("a letter lists the module's topics whose interface-language title starts with it, alphabetically", () => {
    expect(azSlice(list, "a", "en").map((x) => x.slug)).toEqual(["aaron", "abba"]);
    expect(azSlice(list, "א", "he").map((x) => x.slug)).toEqual(["abba", "noen", "aaron"]);
  });
  it("the letter is taken as written: /topics/all/A lists nothing, as sefaria.org", () => {
    expect(azSlice(list, "A", "en")).toEqual([]);
  });
  it("the slice drops the alternative titles (the page needs none)", () => {
    expect(azSlice(list, "a", "en")[0]).not.toHaveProperty("titles");
  });
  it("a filter applies from two characters, matches any title, keeps the server's order with interface-language titles first", () => {
    expect(filterApplies("a")).toBe(false);
    expect(filterApplies("aa")).toBe(true);
    expect(azFiltered(list, "AARON", "en").map((x) => x.slug)).toEqual(["aaron", "ben", "noen"]);
    expect(azFiltered(list, "aaron", "he").map((x) => x.slug)).toEqual(["aaron", "ben", "noen"]);
  });
  it("stripNikkud removes the vowels and cantillation", () => {
    expect(stripNikkud("בְּרֵאשִׁ֖ית")).toBe("בראשית");
  });
});

describe("the landing page's cards and search", () => {
  it("random cards keep topics described in the interface language: 3 of 27 wide, 10 of 1000 on a phone", () => {
    expect(deckPoolSize(3)).toBe(27);
    expect(deckPoolSize(10)).toBe(1000);
    const pool = [t("a", "A", "א", { description: { en: "x" } }), t("b", "B", "ב", { description: { he: "y" } }), t("c", "C", "ג", { description: { en: "z", he: "w" } })];
    expect(describedDeck(pool, "en", 3).map((x) => x.slug)).toEqual(["a", "c"]);
    expect(describedDeck(pool, "he", 1).map((x) => x.slug)).toEqual(["b"]);
  });
  it("suggestions: capitalised, a '(category)' that names the category dropped, the category path after", () => {
    const cats = (slug: string) => (slug === "sarah" ? [{ en: "Biblical Figures", he: "דמויות תנ״כיות" }] : slug === "light" ? [{ en: "Nature", he: "טבע" }, { en: "Phenomena", he: "תופעות" }] : undefined);
    expect(topicSuggestions([{ key: "sarah", title: "sarah (Biblical Figures)" }, { key: "light", title: "Light (Kabbalah)" }, { key: "top", title: "torah" }], "en", cats)).toEqual([
      { text: "Sarah", categoryText: "(Biblical Figures)", slug: "sarah" },
      { text: "Light (Kabbalah)", categoryText: "(Nature > Phenomena)", slug: "light" },
      { text: "Torah", categoryText: "", slug: "top" },
    ]);
  });
});
