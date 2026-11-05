import { describe, expect, it } from "vitest";
import { MAIN_MENU, newTopicPayload, parentTopicOptions, titleObject, validateNewTopic, type NewTopic } from "./topic-editor";

const base: NewTopic = { enTitle: "Moses (prophet)", heTitle: "משה", category: "biblical-figures", enDescription: "", heDescription: "", enAltTitles: [], heAltTitles: [] };

// @feature CON-047
describe("topic editor (the old TopicEditor's prepData for a new topic)", () => {
  it("splits a (disambiguation) off a title", () => {
    expect(titleObject("Moses (prophet)", "en", true)).toEqual({ text: "Moses", lang: "en", primary: true, disambiguation: "prophet" });
    expect(titleObject("Moshe", "en")).toEqual({ text: "Moshe", lang: "en" });
  });

  it("posts primary titles first, then alternates, and descriptions only when given", () => {
    const p = newTopicPayload({ ...base, enAltTitles: ["Moshe Rabbenu"], heAltTitles: ["משה רבנו"] });
    expect(p.category).toBe("biblical-figures");
    expect(p.titles).toEqual([
      { text: "Moses", lang: "en", primary: true, disambiguation: "prophet" },
      { text: "משה", lang: "he", primary: true },
      { text: "Moshe Rabbenu", lang: "en" },
      { text: "משה רבנו", lang: "he" },
    ]);
    expect(p).not.toHaveProperty("description");
    expect(newTopicPayload({ ...base, enDescription: "Leader" }).description).toEqual({ en: "Leader", he: "" });
  });

  it("sends author places, years and era only under Authors", () => {
    expect(newTopicPayload({ ...base, author: { era: "RI" } })).not.toHaveProperty("era");
    expect(newTopicPayload({ ...base, category: "authors", author: { era: "RI", birthYear: "1040" } })).toMatchObject({ era: "RI", birthYear: "1040" });
  });

  it("needs a parent and an English title", () => {
    expect(validateNewTopic({ ...base, category: "" })).toBe("Please choose a category.");
    expect(validateNewTopic({ ...base, enTitle: " " })).toBe("Title must be provided.");
    expect(validateNewTopic({ ...base, category: MAIN_MENU })).toBeNull();
  });

  it("offers every topic that has children as a parent, in TOC order", () => {
    const toc = [
      { slug: "people", primaryTitle: { en: "People", he: "אישים" }, children: [{ slug: "authors", primaryTitle: { en: "Authors", he: "מחברים" }, children: [{ slug: "rashi", primaryTitle: { en: "Rashi", he: 'רש"י' } }] }] },
      { slug: "leaf", primaryTitle: { en: "Leaf", he: "עלה" } },
    ];
    expect(parentTopicOptions(toc).map((p) => p.slug)).toEqual(["people", "authors"]);
  });
});
